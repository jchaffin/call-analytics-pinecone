import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { generateObject } from 'ai';
import { getModel, openModel } from '@/lib/ai';
import { Step1Schema, Step2Schema, Step3Schema, FinalSchema } from '@/utils/schemas';
import { normalizeFinal } from '@/utils/normalization';
import { getPinecone } from '@/lib/pinecone';
import { embedText } from '@/lib/embeddings';

export const runtime = 'nodejs';

function fitVectorDimension(vector: number[], dimension?: number) {
  if (typeof dimension !== 'number' || dimension <= 0) return vector;
  if (vector.length === dimension) return vector;
  if (vector.length > dimension) {
    // For text-embedding-3-large (3072) to index dimension (1024), take first 1024 dimensions
    console.log(`Truncating vector from ${vector.length} to ${dimension} dimensions`);
    return vector.slice(0, dimension);
  }
  // Pad with zeros if vector is smaller than index dimension
  const out = new Array(dimension).fill(0);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i];
  return out;
}

const InputSchema = z.object({
  transcript: z.string().min(10),
  model: z.string().default('gpt-4o-mini'),
});


export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { transcript, model: modelName } = InputSchema.parse(json);

    const model = openModel(modelName);

    // Step 1: Determine call type and success category
    let step1;
    try {
      step1 = await generateObject({
        model,
        schema: Step1Schema,
        system: 'You are an expert call center QA analyst. Classify calls precisely.',
        prompt: `Analyze the transcript and determine:
- callType: Automated or Escalated
- successCategory: Successful, Partially Successful, or Unsuccessful
- confidence: 0..1
- rationale: concise justification.

CALL TYPE DEFINITIONS:
- Automated: AI handled the entire call (no transfer to external channels)
- Escalated: AI explicitly directed customer to contact external support (email, phone, etc.)

Look for EXPLICIT escalation indicators:
- AI says "I cannot help with this, please contact..."
- AI immediately transfers or directs without attempting to help
- Customer's MAIN request cannot be handled by AI

NOT escalation (still Automated):
- AI provides standard policies like "wait 5 days then contact if needed"
- AI answers the main question but mentions future contact options
- AI successfully provides requested information (like order status)
- "If you need further help later, contact..." is NOT escalation

IMPORTANT RULES:
- Classify as Automated or Escalated only
- Automated calls can ONLY be Successful or Unsuccessful (NEVER Partially Successful)
- Escalated calls can ONLY be Partially Successful or Unsuccessful (NEVER Successful)

Guidelines:
- Automated calls:
  - Successful - AI answered the customer's question or resolved their request
  - Unsuccessful - AI failed to help or customer left frustrated
- Escalated calls:
  - Partially Successful - AI provided ANY meaningful help before escalating (e.g., sent links, provided information, answered initial questions)
  - Unsuccessful - AI immediately escalated without providing any help or information

Key: Providing information = Success. The Sarah call is SUCCESSFUL because the AI provided the requested order status.

Transcript:
${transcript}`
      });
    } catch (e: any) {
      // Fallback retry with stricter instruction to satisfy constraints
      try {
        step1 = await generateObject({
          model,
          schema: Step1Schema,
          system: 'You are an expert call center QA analyst. Obey constraints strictly.',
          prompt: `Return a STRICTLY VALID object. 

CALL TYPE RULES:
- Automated = AI resolved the issue completely
- Escalated = AI directed customer to external support (email, phone, etc.)

SUCCESS CATEGORY RULES:
- If callType is Automated, successCategory MUST be either Successful or Unsuccessful (NEVER Partially Successful).
- If callType is Escalated, successCategory MUST NOT be Successful (choose Partially Successful or Unsuccessful).
  - Partially Successful: AI provided ANY help before escalating (sent links, gave info, answered questions)
  - Unsuccessful: AI immediately escalated or provided no meaningful help
- Include confidence in 0..1 and a brief rationale.

Look for these escalation signs:
- AI says "contact support", "email us at", "call our helpline"
- AI admits it cannot help with the request
- Customer needs to be directed to external channels

Provide the final classification for this transcript:
${transcript}`
        });
      } catch (e2: any) {
        throw e2;
      }
    }

    // Step 2: Extract intent
    const step2 = await generateObject({
      model,
      schema: Step2Schema,
      system: 'You identify customer intent and categorize it for analytics.',
      prompt: `Given this transcript, extract the primary intent and a short category.\nReturn fields: intent, intentCategory, confidence, rationale.\n\nTranscript:\n${transcript}`
    });

    // Step 3: Summarize and key points
    const step3 = await generateObject({
      model,
      schema: Step3Schema,
      system: 'You produce concise summaries with key points and action items for call follow-up.',
      prompt: `Summarize the call in 2-3 sentences, list 3-6 key points, and any action items if applicable.\n\nTranscript:\n${transcript}`
    });

    // Step 4: Extract products mentioned
    const ProductExtractionSchema = z.object({
      products: z.array(z.object({
        name: z.string().describe('Full product name as mentioned'),
        brand: z.string().optional().describe('Brand name if mentioned'),
        category: z.string().optional().describe('Product category (shoes, apparel, etc)')
      })).default([])
    });

    const step4 = await generateObject({
      model,
      schema: ProductExtractionSchema,
      system: 'You extract specific products mentioned in customer service calls.',
      prompt: `Extract all specific products mentioned in this transcript. For each product:
- name: The full product name as mentioned (required)
- brand: Only include if explicitly mentioned (e.g., Nike, Adidas)
- category: Identify the product category based on the product type

Common categories:
- "sneakers" for: Air Max, Jordan, running shoes, basketball shoes, etc.
- "apparel" for: shirts, shorts, pants, jackets, Dri-FIT items
- "accessories" for: bags, hats, socks, etc.
- "equipment" for: balls, weights, training gear

For example:
- "Air Max 270" → category: "sneakers"
- "Dri-FIT shirt" → category: "apparel"
- "Jordan 1 High" → category: "sneakers"

Transcript:\n${transcript}`
    });

    // Pinecone: embed transcript and search
    let products: Array<{ id: string; name: string; score: number; category?: string }> = [];
    let keywords: Array<{ term: string; score: number }> = [];
    let relatedDocs: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = [];
    let pineconeRecordId: string | undefined;
    try {
      const pc = getPinecone();
      const indexName = process.env.PINECONE_INDEX || 'products';
      const index = pc.Index(indexName);
      const transcriptVector = (await embedText(transcript)) as number[];
      const query = await index.query({
        vector: transcriptVector,
        topK: 8,
        includeMetadata: true,
      });
      relatedDocs = (query.matches || []).map((m) => ({ id: String(m.id), score: m.score ?? 0, metadata: m.metadata as any }));
      // Heuristic extraction from metadata
      products = relatedDocs
        .map((d) => ({ id: d.id, name: String((d.metadata as any)?.name ?? d.id), score: Math.max(0, Math.min(1, d.score)) }))
        .slice(0, 5);
      const terms = new Map<string, number>();
      for (const d of relatedDocs) {
        const kws = (d.metadata as any)?.keywords as string[] | undefined;
        if (Array.isArray(kws)) for (const t of kws) terms.set(t, Math.max(terms.get(t) ?? 0, d.score));
      }
      keywords = [...terms.entries()].map(([term, score]) => ({ term, score: Math.max(0, Math.min(1, score)) })).slice(0, 10);
    } catch (_) {
    }

    // Add AI-extracted products
    try {
      const aiProducts = step4.object.products;
      const seen = new Set(products.map((p) => p.name.toLowerCase()));
      
      for (const p of aiProducts) {
        const productName = p.name.trim();
        if (productName && !seen.has(productName.toLowerCase())) {
          const id = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          products.push({ 
            id, 
            name: productName, 
            score: 0.9, // Higher confidence for AI-extracted products
            category: p.category
          });
          seen.add(productName.toLowerCase());
        }
      }
    } catch (_) {}

    // Pinecone: upsert analyzed call with intent/outcome/product tags for later filtering
    try {
      const pc = getPinecone();
      const callsIndexName = process.env.PINECONE_CALLS_INDEX || 'calls';
      const callsNamespace = process.env.PINECONE_CALLS_NAMESPACE || undefined;
      const callsIndex = pc.Index(callsIndexName);
      const stats = await callsIndex.describeIndexStats();
      const rawVector = (await embedText(transcript)) as number[];
      const vector = fitVectorDimension(rawVector, stats.dimension);
      const id = createHash('sha1').update(transcript).digest('hex');
      const metadata = {
        intent: step2.object.intent,
        intentCategory: step2.object.intentCategory,
        successCategory: step1.object.successCategory,
        callType: step1.object.callType,
        productIds: JSON.stringify(products.map((p) => p.id)),
        productNames: JSON.stringify(products.map((p) => p.name)),
        keywords: JSON.stringify(keywords.map((k) => k.term)),
        transcriptSnippet: transcript.length > 600 ? `${transcript.slice(0, 600)}…` : transcript,
      };
      const target = callsNamespace ? callsIndex.namespace(callsNamespace) : callsIndex;
      await target.upsert([
        {
          id,
          values: vector,
          metadata,
        },
      ]);
      pineconeRecordId = id;
      console.log('Pinecone record created with ID:', id);
    } catch (e) {
      // Do not fail the request if storing to Pinecone fails, but log for visibility
      console.error('Pinecone upsert failed', e);
    }

    // Compose final object and normalize
    const composed = {
      callType: step1.object.callType,
      successCategory: step1.object.successCategory,
      intent: step2.object.intent,
      intentCategory: step2.object.intentCategory,
      confidence: Math.min(1, Math.max(0, (step1.object.confidence + step2.object.confidence) / 2)),
      summary: step3.object.summary,
      keyPoints: step3.object.keyPoints,
      actionItems: step3.object.actionItems,
      escalationReason: step1.object.callType === 'Escalated' ? step1.object.rationale : undefined,
      products,
      keywords,
      relatedDocs,
      pineconeRecordId,
    };

    const normalized = normalizeFinal(composed);
    if (!normalized) {
      // Final guard validation
      const parsed = FinalSchema.safeParse(composed);
      if (!parsed.success) {
        return NextResponse.json({ error: 'ValidationError', issues: parsed.error.flatten() }, { status: 400 });
      }
      return NextResponse.json(parsed.data);
    }

    return NextResponse.json(normalized);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'BadRequest', issues: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'InternalServerError' }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { generateObject } from 'ai';
import { getModel, openModel, getDefaultModel } from '@/lib/ai';
import { CallTypeEnum, SuccessCategoryEnum, FinalSchema } from '@/utils/schemas';
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
  model: z.string().default(() => getDefaultModel()),
});


export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const timings: Record<string, number> = {};
  
  try {
    const json = await req.json();
    const { transcript, model: modelName } = InputSchema.parse(json);

    const model = openModel(modelName);

    // Define schemas for parallel analysis
    const PassASchema = z.object({
      callType: CallTypeEnum,
      successCategory: SuccessCategoryEnum,
      intent: z.string().min(1),
      intentCategory: z.string().min(1),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1)
    });

    const PassBSchema = z.object({
      summary: z.string().min(1),
      keyPoints: z.array(z.string().min(1)).min(1),
      actionItems: z.array(z.string().min(1)).default([]),
      products: z.array(z.object({
        name: z.string().describe('Full product name as mentioned'),
        brand: z.string().optional().describe('Brand name if mentioned'),
        category: z.string().optional().describe('Product category')
      })).default([])
    });

    // Run Pass A and Pass B in parallel
    const aiStartTime = performance.now();
    const [passA, passB] = await Promise.all([
      // Pass A: Classification (call type, success, intent)
      generateObject({
        model,
        schema: PassASchema,
        system: 'You are an expert call center QA analyst. Classify calls and identify intent.',
        prompt: `Analyze the transcript and determine:
1. callType: Automated or Escalated
   - Automated: AI handled the entire call
   - Escalated: AI directed customer to external support
   
2. successCategory: Successful, Partially Successful, or Unsuccessful
   - Automated calls: Only Successful or Unsuccessful
     * Successful: AI provided requested information or resolved the issue
     * Unsuccessful: AI failed to help or customer left frustrated
   - Escalated calls: Only Partially Successful or Unsuccessful
     * Partially Successful: AI provided some help before escalating
     * Unsuccessful: AI immediately escalated without helping
     
3. intent: Primary customer intent (e.g., "Check order status")
4. intentCategory: Category of intent (e.g., "Order inquiry")
5. confidence: 0-1
6. rationale: Brief explanation

IMPORTANT: If the AI provides the information requested (order status, tracking info, etc.), 
the call is SUCCESSFUL even if the conversation is incomplete.

Transcript:
${transcript}`
      }).catch(async (e) => {
        // Retry with stricter prompt if validation fails
        return generateObject({
          model,
          schema: PassASchema,
          system: 'Expert QA analyst. Follow rules strictly.',
          prompt: `STRICT RULES:
- Automated calls CANNOT be "Partially Successful" (only Successful or Unsuccessful)
- Escalated calls CANNOT be "Successful" (only Partially Successful or Unsuccessful)
- Mark as Successful if AI provided the requested information
- All fields required

Analyze this transcript:
${transcript}`
        });
      }),

      // Pass B: Content extraction (summary, products, key points)
      generateObject({
        model,
        schema: PassBSchema,
        system: 'You extract key information from customer service calls.',
        prompt: `Extract from this transcript:
1. summary: 2-3 sentence summary
2. keyPoints: 3-6 key points from the call
3. actionItems: Any follow-up actions needed
4. products: Specific products mentioned with:
   - name: Full product name
   - brand: If mentioned (Nike, Adidas, etc.)
   - category: sneakers/apparel/accessories/equipment

Transcript:
${transcript}`
      })
    ]);
    timings.ai_analysis = performance.now() - aiStartTime;

    // Pinecone: embed transcript and search
    let products: Array<{ id: string; name: string; score: number; category?: string }> = [];
    let keywords: Array<{ term: string; score: number }> = [];
    let relatedDocs: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = [];
    let pineconeRecordId: string | undefined;
    
    const pineconeSearchStartTime = performance.now();
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
    timings.pinecone_search = performance.now() - pineconeSearchStartTime;

    // Add AI-extracted products from Pass B
    try {
      const aiProducts = passB.object.products;
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
    const pineconeUpsertStartTime = performance.now();
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
        intent: passA.object.intent,
        intentCategory: passA.object.intentCategory,
        successCategory: passA.object.successCategory,
        callType: passA.object.callType,
        productIds: JSON.stringify(products.map((p) => p.id)),
        productNames: JSON.stringify(products.map((p) => p.name)),
        keywords: JSON.stringify(keywords.map((k) => k.term)),
        transcript: transcript,
        transcriptLength: transcript.length,
        analyzedAt: new Date().toISOString(),
        modelUsed: modelName,
        summary: passB.object.summary,
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
    timings.pinecone_upsert = performance.now() - pineconeUpsertStartTime;

    // Compose final object and normalize
    const composed = {
      callType: passA.object.callType,
      successCategory: passA.object.successCategory,
      intent: passA.object.intent,
      intentCategory: passA.object.intentCategory,
      confidence: passA.object.confidence,
      summary: passB.object.summary,
      keyPoints: passB.object.keyPoints,
      actionItems: passB.object.actionItems,
      escalationReason: passA.object.callType === 'Escalated' ? passA.object.rationale : undefined,
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

    timings.total = performance.now() - startTime;
    
    // Add timing information to response
    const response = {
      ...normalized,
      _timings: {
        ...timings,
        unit: 'ms'
      }
    };
    
    return NextResponse.json(response);
  } catch (err) {
    timings.total = performance.now() - startTime;
    
    if (err instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'BadRequest', 
        issues: err.flatten(),
        _timings: { ...timings, unit: 'ms' }
      }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ 
      error: 'InternalServerError',
      _timings: { ...timings, unit: 'ms' }
    }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { MODEL_PROVIDERS, openModel, getDefaultModel } from '@/lib/ai';
import { CallTypeEnum, SuccessCategoryEnum } from '@/utils/schemas';
import { normalizeFinal } from '@/utils/normalization';

export const runtime = 'nodejs';

const InputSchema = z.object({
  transcript: z.string().min(10),
  includeProviders: z.array(z.string()).optional(), // Optional: specific providers to include
});

// Define schemas for analysis (same as main analyze route)
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

async function analyzeWithModel(modelId: string, transcript: string) {
  const startTime = performance.now();
  
  try {
    const model = openModel(modelId);
    
    // Run Pass A and Pass B in parallel for this model
    const [passA, passB] = await Promise.all([
      // Pass A: Classification
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

      // Pass B: Content extraction
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

    const composed = {
      modelId,
      callType: passA.object.callType,
      successCategory: passA.object.successCategory,
      intent: passA.object.intent,
      intentCategory: passA.object.intentCategory,
      confidence: passA.object.confidence,
      summary: passB.object.summary,
      keyPoints: passB.object.keyPoints,
      actionItems: passB.object.actionItems,
      products: passB.object.products.map(p => ({
        id: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        name: p.name,
        score: 0.9,
        category: p.category
      })),
      analysisTime: performance.now() - startTime,
    };

    const normalized = normalizeFinal(composed) || composed;
    
    return {
      success: true,
      modelId,
      result: normalized,
      error: null
    };
    
  } catch (error: any) {
    return {
      success: false,
      modelId,
      result: null,
      error: error.message || 'Analysis failed'
    };
  }
}

export async function POST(req: NextRequest) {
  const overallStartTime = performance.now();
  
  try {
    const json = await req.json();
    const { transcript, includeProviders } = InputSchema.parse(json);
    
    // Get all models to process
    const modelsToProcess: { modelId: string; provider: string; name: string }[] = [];
    
    for (const [providerId, provider] of Object.entries(MODEL_PROVIDERS)) {
      // Skip if specific providers requested and this isn't one
      if (includeProviders && !includeProviders.includes(providerId)) {
        continue;
      }
      
      for (const [modelId, modelInfo] of Object.entries(provider.models)) {
        modelsToProcess.push({
          modelId,
          provider: providerId,
          name: modelInfo.name
        });
      }
    }
    
    // Process all models in parallel
    const results = await Promise.all(
      modelsToProcess.map(({ modelId }) => analyzeWithModel(modelId, transcript))
    );
    
    // Organize results by provider
    const resultsByProvider: Record<string, any[]> = {};
    results.forEach((result, index) => {
      const { provider } = modelsToProcess[index];
      if (!resultsByProvider[provider]) {
        resultsByProvider[provider] = [];
      }
      resultsByProvider[provider].push({
        ...result,
        modelInfo: modelsToProcess[index]
      });
    });
    
    // Calculate statistics
    const successfulAnalyses = results.filter(r => r.success).length;
    const failedAnalyses = results.filter(r => !r.success).length;
    
    // Find consensus on key metrics
    const successfulResults = results.filter(r => r.success && r.result);
    const callTypeVotes: Record<string, number> = {};
    const successCategoryVotes: Record<string, number> = {};
    const intentVotes: Record<string, number> = {};
    
    successfulResults.forEach(({ result }) => {
      if (result) {
        callTypeVotes[result.callType] = (callTypeVotes[result.callType] || 0) + 1;
        successCategoryVotes[result.successCategory] = (successCategoryVotes[result.successCategory] || 0) + 1;
        const normalizedIntent = result.intent.toLowerCase();
        intentVotes[normalizedIntent] = (intentVotes[normalizedIntent] || 0) + 1;
      }
    });
    
    const consensus = {
      callType: Object.entries(callTypeVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
      successCategory: Object.entries(successCategoryVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
      intent: Object.entries(intentVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
      totalVotes: successfulAnalyses
    };
    
    return NextResponse.json({
      success: true,
      transcript,
      totalModels: modelsToProcess.length,
      successfulAnalyses,
      failedAnalyses,
      consensus,
      resultsByProvider,
      results: results.map((r, i) => ({
        ...r,
        modelInfo: modelsToProcess[i]
      })),
      processingTime: performance.now() - overallStartTime,
    });
    
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ 
        success: false,
        error: 'BadRequest', 
        issues: err.flatten() 
      }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ 
      success: false,
      error: 'InternalServerError',
      message: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}

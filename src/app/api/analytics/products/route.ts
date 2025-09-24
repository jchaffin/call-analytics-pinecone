import { NextRequest, NextResponse } from 'next/server';
import { getPinecone } from '@/lib/pinecone';
import { NormalizedIntentSchema } from '@/utils/normalization';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const pc = getPinecone();
    const callsIndexName = process.env.PINECONE_CALLS_INDEX || 'calls';
    const callsNamespace = process.env.PINECONE_CALLS_NAMESPACE || undefined;
    const index = pc.Index(callsIndexName);
    const target = callsNamespace ? index.namespace(callsNamespace) : index;

    // Query parameters
    const { searchParams } = new URL(req.url);
    const productName = searchParams.get('product');
    const intent = searchParams.get('intent');
    const successCategory = searchParams.get('successCategory');
    const limit = parseInt(searchParams.get('limit') || '100');
    const useSemanticClustering = searchParams.get('clustering') === 'true';

    // Build filter
    const filter: Record<string, any> = {};
    // Don't use productName in the Pinecone filter since productNames is a JSON string
    // We'll filter in post-processing instead
    if (intent) {
      filter.intent = intent;
    }
    if (successCategory) {
      filter.successCategory = successCategory;
    }

    // Query vectors with metadata filter
    const queryResponse = await target.query({
      topK: limit,
      includeMetadata: true,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      vector: new Array(1024).fill(0), // Dummy vector for metadata-only query
    });

    // Aggregate results by product
    const productAnalytics: Record<string, {
      totalCalls: number;
      byIntent: Record<string, number>;
      byOutcome: Record<string, number>;
      byCallType: Record<string, number>;
      intents: Array<{ intent: string; category: string; count: number }>;
      records: Array<{
        id: string;
        intent: string;
        outcome: string;
        callType: string;
        transcript?: string;
        transcriptSnippet?: string;
      }>;
    }> = {};

    for (const match of queryResponse.matches || []) {
      const metadata = match.metadata as any;
      if (!metadata) continue;

      // Parse product names from JSON string
      let productNames: string[] = [];
      try {
        productNames = JSON.parse(metadata.productNames || '[]');
      } catch {
        productNames = [];
      }

      for (const product of productNames) {
        // If filtering by product name, skip products that don't match
        if (productName && product !== productName) {
          continue;
        }
        
        if (!productAnalytics[product]) {
          productAnalytics[product] = {
            totalCalls: 0,
            byIntent: {},
            byOutcome: {},
            byCallType: {},
            intents: [],
            records: [],
          };
        }

        const analytics = productAnalytics[product];
        analytics.totalCalls++;

        // Track by outcome
        const outcome = metadata.successCategory || 'Unknown';
        analytics.byOutcome[outcome] = (analytics.byOutcome[outcome] || 0) + 1;

        // Track by intent (normalized)
        const rawIntent = metadata.intent || 'Unknown';
        const intentStr = rawIntent === 'Unknown' ? 'Unknown' : NormalizedIntentSchema.parse(rawIntent);
        const intentCategory = metadata.intentCategory || 'Unknown';
        analytics.byIntent[intentStr] = (analytics.byIntent[intentStr] || 0) + 1;

        // Track by call type
        const callType = metadata.callType || 'Unknown';
        analytics.byCallType[callType] = (analytics.byCallType[callType] || 0) + 1;

        // Store record reference with normalized intent
        analytics.records.push({
          id: match.id,
          intent: intentStr, // Already normalized above
          outcome: outcome,
          callType: callType,
          transcript: metadata.transcript,
          transcriptSnippet: metadata.transcriptSnippet,
        });
      }
    }

    // Convert intent tracking to sorted array
    for (const product in productAnalytics) {
      const analytics = productAnalytics[product];
      const intentMap = new Map<string, { category: string; count: number }>();
      
      // Re-scan matches to get intent categories
      for (const match of queryResponse.matches || []) {
        const metadata = match.metadata as any;
        let productNames: string[] = [];
        try {
          productNames = JSON.parse(metadata.productNames || '[]');
        } catch {
          productNames = [];
        }
        
        if (productNames.includes(product) && metadata.intent) {
          const normalizedIntent = metadata.intent === 'Unknown' ? 'Unknown' : NormalizedIntentSchema.parse(metadata.intent);
          const existing = intentMap.get(normalizedIntent);
          if (existing) {
            existing.count++;
          } else {
            intentMap.set(normalizedIntent, {
              category: metadata.intentCategory || 'Unknown',
              count: 1,
            });
          }
        }
      }

      analytics.intents = Array.from(intentMap.entries())
        .map(([intent, data]) => ({
          intent,
          category: data.category,
          count: data.count,
        }))
        .sort((a, b) => b.count - a.count);
    }

    // Calculate success rates
    const productSummary = Object.entries(productAnalytics).map(([product, analytics]) => ({
      product,
      totalCalls: analytics.totalCalls,
      successRate: ((analytics.byOutcome['Successful'] || 0) / analytics.totalCalls * 100).toFixed(1),
      partialSuccessRate: ((analytics.byOutcome['Partially Successful'] || 0) / analytics.totalCalls * 100).toFixed(1),
      failureRate: ((analytics.byOutcome['Unsuccessful'] || 0) / analytics.totalCalls * 100).toFixed(1),
      topIntents: analytics.intents.slice(0, 5),
      outcomes: analytics.byOutcome,
      callTypes: analytics.byCallType,
      // Group records by outcome
      recordsByOutcome: {
        'Successful': analytics.records.filter(r => r.outcome === 'Successful'),
        'Partially Successful': analytics.records.filter(r => r.outcome === 'Partially Successful'),
        'Unsuccessful': analytics.records.filter(r => r.outcome === 'Unsuccessful'),
      },
      // Add Pinecone links
      pineconeLinks: analytics.records.map(r => ({
        id: r.id,
        intent: r.intent,
        outcome: r.outcome,
        callType: r.callType,
        snippet: (r.transcript || r.transcriptSnippet || '').substring(0, 200) + ((r.transcript || r.transcriptSnippet || '').length > 200 ? '...' : ''),
      })),
    })).sort((a, b) => b.totalCalls - a.totalCalls);

    return NextResponse.json({
      totalProducts: productSummary.length,
      totalRecords: queryResponse.matches?.length || 0,
      products: productSummary,
      filters: {
        product: productName,
        intent,
        successCategory,
      },
    });
  } catch (error: any) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

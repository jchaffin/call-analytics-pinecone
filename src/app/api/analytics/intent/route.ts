import { NextRequest, NextResponse } from 'next/server';
import { getPinecone } from '@/lib/pinecone';
import { embedText } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Group intents using hierarchical clustering
function clusterIntents(intents: Array<{ intent: string; embedding: number[]; count: number }>, threshold: number = 0.8) {
  // Start with each intent in its own cluster
  const clusters: Array<{
    primary: string;
    members: Array<{ intent: string; count: number }>;
    totalCount: number;
    embedding: number[];
  }> = intents.map(item => ({
    primary: item.intent,
    members: [{ intent: item.intent, count: item.count }],
    totalCount: item.count,
    embedding: item.embedding
  }));
  
  // Merge clusters until no more similar pairs exist
  let merged = true;
  while (merged) {
    merged = false;
    
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const similarity = cosineSimilarity(clusters[i].embedding, clusters[j].embedding);
        
        if (similarity >= threshold) {
          // Merge cluster j into cluster i
          clusters[i].members.push(...clusters[j].members);
          clusters[i].totalCount += clusters[j].totalCount;
          
          // Update primary to the most frequent intent
          clusters[i].members.sort((a, b) => b.count - a.count);
          clusters[i].primary = clusters[i].members[0].intent;
          
          // Update embedding to weighted average
          const totalCount = clusters[i].totalCount;
          for (let k = 0; k < clusters[i].embedding.length; k++) {
            clusters[i].embedding[k] = 
              (clusters[i].embedding[k] * (totalCount - clusters[j].totalCount) + 
               clusters[j].embedding[k] * clusters[j].totalCount) / totalCount;
          }
          
          // Remove merged cluster
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }
  
  return clusters;
}

export async function GET(req: NextRequest) {
  try {
    const pc = getPinecone();
    const callsIndexName = process.env.PINECONE_CALLS_INDEX || 'calls';
    const callsNamespace = process.env.PINECONE_CALLS_NAMESPACE || undefined;
    const index = pc.Index(callsIndexName);
    const target = callsNamespace ? index.namespace(callsNamespace) : index;
    
    // Get similarity threshold from query params
    const { searchParams } = new URL(req.url);
    const threshold = parseFloat(searchParams.get('threshold') || '0.8');
    const limit = parseInt(searchParams.get('limit') || '1000');
    
    // Query all vectors to get unique intents
    const queryResponse = await target.query({
      topK: limit,
      includeMetadata: true,
      vector: new Array(1024).fill(0), // Dummy vector for metadata-only query
    });
    
    // Count unique intents
    const intentCounts = new Map<string, number>();
    for (const match of queryResponse.matches || []) {
      const metadata = match.metadata as any;
      const intent = metadata.intent;
      if (intent) {
        intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
      }
    }
    
    // Get unique intents sorted by frequency
    const uniqueIntents = Array.from(intentCounts.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count);
    
    // Embed all unique intents
    const intentTexts = uniqueIntents.map(item => item.intent);
    const embeddings = await embedText(intentTexts) as number[][];
    
    // Combine intents with their embeddings
    const intentsWithEmbeddings = uniqueIntents.map((item, i) => ({
      ...item,
      embedding: embeddings[i]
    }));
    
    // Cluster the intents
    const clusters = clusterIntents(intentsWithEmbeddings, threshold);
    
    // Sort clusters by total count
    clusters.sort((a, b) => b.totalCount - a.totalCount);
    
    // Calculate statistics
    const totalIntents = uniqueIntents.length;
    const totalClusters = clusters.length;
    const avgIntentsPerCluster = totalIntents / totalClusters;
    
    return NextResponse.json({
      totalIntents,
      totalClusters,
      avgIntentsPerCluster: avgIntentsPerCluster.toFixed(2),
      threshold,
      clusters: clusters.map(cluster => ({
        primary: cluster.primary,
        count: cluster.totalCount,
        members: cluster.members,
        variations: cluster.members.length
      }))
    });
    
  } catch (error: any) {
    console.error('Intent clustering error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

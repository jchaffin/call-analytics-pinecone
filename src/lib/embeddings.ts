import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const defaultEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

export async function embedText(input: string | string[], model = defaultEmbeddingModel) {
  const data = Array.isArray(input) ? input : [input];
  const result = await embedMany({
    model: openai.embedding(model),
    values: data,
  });
  return Array.isArray(input) ? result.embeddings : result.embeddings[0];
}


import { Pinecone } from '@pinecone-database/pinecone';

let client: Pinecone | null = null;

export function getPinecone() {
  if (!client) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error('Missing PINECONE_API_KEY');
    client = new Pinecone({ apiKey });
  }
  return client;
}


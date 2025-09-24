# Post Call Analytics (embedding version)

Multi-step prompt-chained analysis with strict Zod validation and normalized responses.

# Setup

1. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` (or OLLAMA vars).
2. Install deps: `npm install`
3. Dev server: `npm run dev`

## Environment (required)

Set these in `.env.local` before using the APIs:

- `OPENAI_API_KEY` 
- `ANTHROPIC_API_KEY`, 
- `GOOGLE_GENERATIVE_AI_API_KEY`, 
- `MISTRAL_API_KEY`
- `PINECONE_API_KEY`,`PINECONE_CALLS_INDEX` (default: `calls`)
- `PINECONE_CALLS_NAMESPACE` (optional)
- `PINECONE_INDEX` (products index, default: `products`)
- `OPENAI_EMBEDDING_MODEL` (e.g., `text-embedding-3-small` or `text-embedding-3-large`)

## API

- POST `/api/analyze`
  - Body: `{ transcript: string, model?: string }`
  - Response (normalized) includes:
    - `callType`, `successCategory`, `intent`, `intentCategory`, `confidence`
    - `summary`, `keyPoints[]`, `actionItems[]`, `escalationReason?`
    - `products[]` (name-only, brand/category optional), `keywords[]`, `orderNumbers[]`
    - `relatedDocs[]`, `pineconeRecordId`, `_timings`

- GET `/api/analytics/products`
  - Query: `?product=<name>&intent=<str>&successCategory=<str>&limit=<n>`
  - Returns per-product aggregates: totals, success rates, top intents, outcomes, sample record refs.

- GET `/api/calls/[id]`
  - Returns a stored call record (metadata + parsed `products[]`).

Rules

- `Automated` cannot be *Partially Successful*.
- `Escalated` cannot be *Successful*.

## Parallel AI Analysis (Multiple Prompts in Parallel)

The analysis runs three independent AI passes concurrently using `Promise.all` for speed and determinism. Each pass has a strict Zod schema and a focused prompt.

### Pass A: Classification (call type, outcome, intent)
System: "You are an expert call center QA analyst. Classify calls and identify intent."

Prompt outline:
```text
Analyze the transcript and determine:
1. callType: Automated, Escalated
2. successCategory: Successful, Partially Successful, or Unsuccessful
3. intent: Primary customer intent
4. intentCategory: Category of intent
5. confidence: 0-1
6. rationale: Brief explanation

Transcript:
<TRANSCRIPT>
```

Schema (Zod):
```ts
const PassASchema = z.object({
  callType: CallTypeEnum,
  successCategory: SuccessCategoryEnum,
  intent: z.string().min(1),
  intentCategory: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
```

### Pass B: Content extraction (summary, key points, action items)
System: "You extract key information from customer service calls."

Prompt outline:
```text
Extract from this transcript:
1. summary: 2-3 sentence summary
2. keyPoints: 3-6 key points from the call
3. actionItems: Any follow-up actions needed

Transcript:
<TRANSCRIPT>
```

Schema (Zod):
```ts
const PassBSchema = z.object({
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  actionItems: z.array(z.string().min(1)).default([]),
});
```

### Pass C: Product and order number extraction
System: "You extract products and order numbers from customer service calls."

Prompt outline:
```text
Extract from this transcript:
1. products: Specific products mentioned with:
   - name: Product name without brand
   - brand: Brand name
   - category: Semantic category based on product type
2. orderNumbers: Order numbers, reference numbers, or tracking numbers mentioned

Transcript:
<TRANSCRIPT>
```

Schema (Zod):
```ts
const PassCSchema = z.object({
  products: z.array(z.object({
    name: z.string(),          // name only, no brand prefix
    brand: z.string().optional(),
    category: z.string().optional(),
  })).default([]),
  orderNumbers: z.array(z.string()).default([]),
});
```

All three passes run in parallel:
```ts
const [passA, passB, passC] = await Promise.all([
  generateObject({...Pass A...}),
  generateObject({...Pass B...}),
  generateObject({...Pass C...}),
]);
```

## Schema Validation and Normalization

- Each pass is validated against its Zod schema at generation time (invalid generations are retried with stricter instructions).
- The three pass results are composed into a single object and then normalized via `normalizeFinal(...)` to a single canonical shape used by the UI and APIs.
- As a safety net, the composed payload is validated against `FinalSchema` before returning.

Benefits:
- Deterministic fields, predictable types, and resilient fallbacks.
- Decouples prompt wording from downstream consumers.

## Pinecone Integration

This project uses Pinecone for two purposes:

- Product discovery (semantic search): query a product index with the transcript embedding to surface related products/keywords.
- Call storage (vector store of analyzed calls): upsert each analyzed call with a transcript embedding and rich metadata for analytics.

### Product discovery (search)
```ts
const index = pc.Index(process.env.PINECONE_INDEX || 'products');
const transcriptVector = await embedText(transcript);
const query = await index.query({
  vector: transcriptVector,
  topK: 8,
  includeMetadata: true,
});
// Map top matches to relatedDocs/products/keywords
```

### Call storage (upsert)

Vectors are embedded from the raw transcript, then dimension-fit to the index:
```ts
const stats = await callsIndex.describeIndexStats();
const rawVector = await embedText(transcript);
const values = fitVectorDimension(rawVector, stats.dimension);
```

We then upsert with rich metadata:

```ts
await target.upsert([
  {
    id, // sha1(transcript)
    values,
    metadata: {
      intent,
      intentCategory,
      successCategory,
      callType,
      products: JSON.stringify(products), // [{ id, name, brand?, category?, score }]
      keywords: JSON.stringify(keywords.map(k => k.term)),
      transcript,
      transcriptLength: transcript.length,
      analyzedAt: new Date().toISOString(),
      modelUsed: modelName,
      summary: passB.object.summary,
    },
  },
]);
```

### Linkage in UI

- Products extracted from the transcript are rendered in the AI text (summary, key points, action items).
- Product names become hyperlinks to the specific call record page: `/calls/{pineconeRecordId}`.
- The "Products Mentioned" chips also link to the same call record for quick drill-down.


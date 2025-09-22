# Post Call Analytics (embedding version)

Multi-step prompt-chained analysis with strict Zod validation and normalized responses.


## Pinecone Product Analytics System
This application uses Pinecone as a vector database to store and analyze customer service call transcripts with product information. Here's how it works:

1. Call Analysis & Storage (/api/analyze)
When a call transcript is analyzed, the system:
Extracts products mentioned in the call using AI
Creates an embedding (vector) of the transcript
Stores the call in Pinecone with metadata including:

`productNames`: JSON array of products mentioned
`intent`: What the customer wanted
`successCategory`: Whether the call was successful
`callType`: Automated or Escalated
`keywords`: Relevant search terms
`transcriptSnippet`: Preview of the call

2. Product Analytics Retrieval (`/api/analytics/products`)
The system can then:
Query all stored calls from Pinecone
Parse the product names from each call's metadata
Aggregate analytics by product:
Total calls per product
Success/failure rates
Common intents (e.g., "order status", "returns")
Call type distribution
Sample calls for each outcome

3. Use Cases
This enables powerful product-level insights:
Which products generate the most support calls?
What are the success rates for calls about specific products?
What issues do customers face with each product?
Which products might need better documentation or quality improvements?

## Setup

1. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` (or OLLAMA vars).
2. Install deps: `npm install`
3. Dev server: `npm run dev`

### API

- POST `/api/analyze`
  - Body: `{ transcript: string }`
  - Response (normalized):
  ```json
    {
      "callType": "Automated|Human|Escalated",
      "successCategory": "Successful|Partially Successful|Unsuccessful",
      "intent": "...",
      "intentCategory": "...",
      "confidence": 0.0,
      "summary": "...",
      "keyPoints": ["..."],
      "actionItems": ["..."],
      "escalationReason": "optional"
    }
    ```

Rules

- Automated cannot be Partially Successful.
- Escalated cannot be Successful.


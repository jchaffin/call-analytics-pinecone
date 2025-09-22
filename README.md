Post Call Analytics (Next.js + AI SDK)

Multi-step prompt-chained analysis with strict Zod validation and normalized responses.

Setup

1. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` (or OLLAMA vars).
2. Install deps: `npm install`
3. Dev server: `npm run dev`

API

- POST `/api/analyze`
  - Body: `{ transcript: string }`
  - Response (normalized):
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

Rules

- Automated cannot be Partially Successful.
- Escalated cannot be Successful.


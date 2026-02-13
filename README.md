# MedCloud Guide (Cloudflare AI Assignment)

A medicine-focused AI app built on Cloudflare with:

- LLM: Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- Workflow/coordination: Worker orchestrates request flow
- User input: browser chat UI
- Memory/state: Durable Object keeps chat history per session

## Why this is original

Instead of a generic chatbot, this app is a **medical education guide** that:

- asks follow-up questions when context is missing,
- gives practical next steps,
- includes safety disclaimers,
- preserves conversation memory for continuity.

## Architecture

1. User sends a message from the chat UI.
2. Worker fetches session history from `ChatSessionDO`.
3. Worker calls Workers AI with system prompt + history + new user message.
4. Worker stores both user and assistant messages back in `ChatSessionDO`.
5. Worker returns the assistant response to the UI.

## Step-by-step (easy)

1. Install dependencies:

```bash
npm install
```

2. Login to Cloudflare (if needed):

```bash
npx wrangler login
```

3. Run locally:

```bash
npm run dev
```

4. Open the local URL shown by Wrangler and chat with MedCloud Guide.

5. Deploy:

```bash
npm run deploy
```

6. Copy your deployed URL and submit your GitHub repo URL for the assignment.

## Suggested submission format

- **GitHub repo URL**: `https://github.com/<your-user>/in_the_clouds`
- **Live URL**: `<your-worker-url>`
- **Notes**:
  - Uses Workers AI + Durable Objects
  - Includes chat UI + per-session memory
  - Medical guidance only (non-diagnostic)

## Files

- `src/index.ts`: Worker, API routes, Durable Object, and UI
- `wrangler.toml`: Cloudflare bindings + Durable Object migration

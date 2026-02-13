# Clinic Companion (Cloudflare AI Assignment)

Clinic Companion is an original, medicine-themed AI app for educational intake + triage + SOAP note drafting.

It satisfies the assignment requirements:

- LLM: Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- Workflow / coordination: multi-step triage pipeline coordinated in the Worker
- User input: browser chat + optional voice input via Web Speech API
- Memory/state: per-session Durable Object state (profile, summary, last triage)

## Safety notice

This app is educational only and not medical advice.
Do not enter real personal health data.

## What it does

1. User chats symptoms (or uses voice input).
2. Assistant asks follow-up questions.
3. User clicks **Run Triage**.
4. App runs a 3-step pipeline:
   - extract structured case JSON,
   - apply deterministic red-flag rules,
   - generate a SOAP note draft.
5. Profile + summaries + triage results persist in Durable Objects.

## Architecture

- `src/index.ts`
  - Worker routes:
    - `POST /api/profile`
    - `POST /api/chat`
    - `POST /api/triage`
    - `POST /api/reset`
  - Durable Object `ChatSessionDO` stores:
    - `profile`
    - `history`
    - `conversationSummary`
    - `draftCase`
    - `lastTriage`
  - Inlined frontend UI:
    - chat,
    - voice capture,
    - triage progress,
    - SOAP output panel.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Authenticate Wrangler (if needed):

```bash
npx wrangler login
```

3. Run locally:

```bash
npm run dev
```

4. Open the URL printed by Wrangler and test chat + triage.

## Deploy

```bash
npm run deploy
```

## Assignment demo script (30 seconds)

1. Save profile (optional).
2. Enter: `Sore throat 3 days, fever 38.7C, fatigue`.
3. Answer follow-ups.
4. Click **Run Triage**.
5. Show workflow progress + recommendation + SOAP note.

## Submission

- GitHub repo URL: `https://github.com/dirgnic/in_the_clouds`
- Live worker URL: `<your deployed URL>`

## Notes on the Cloudflare docs references you shared

Your referenced architecture (Agents starter + Workflows + callable methods + JSON-mode extraction) is compatible with this project direction. This MVP keeps implementation compact while still covering the assignment criteria with Workers AI + Durable Objects + coordinated triage steps.

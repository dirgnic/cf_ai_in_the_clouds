# Clinic Companion (Cloudflare AI Assignment)

Clinic Companion is an original, medicine-themed AI app for educational intake + triage + SOAP note drafting.

## Compliance Checklist

- Repository name prefix requirement: **`cf_ai_`**
- Project documentation and run instructions: **this `README.md`**
- AI prompts used: **`PROMPTS.md`**
- Original work statement: implemented specifically for this submission

## Assignment Requirements Coverage

- LLM: Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- Workflow / coordination: multi-step triage pipeline coordinated in the Worker
- User input: browser chat + optional voice input via Web Speech API
- Memory/state: per-session Durable Object state (profile, summary, last triage)

## Safety Notice

This app is educational only and not medical advice.
Do not enter real personal health data.

## What It Does

1. User chats symptoms (or uses voice input).
2. Assistant asks follow-up questions.
3. User clicks **Run Triage**.
4. App runs a 3-step pipeline:
   - extract structured case JSON,
   - apply deterministic red-flag rules,
   - generate a SOAP note draft.
5. Profile + summaries + triage results persist in Durable Objects.

## Architecture

- Backend: Cloudflare Worker (`src/index.ts`)
- Model: Workers AI via `env.AI.run(...)`
- State: Durable Object `ChatSessionDO`
- Frontend: inlined HTML/CSS/JS chat UI in `src/index.ts`

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Authenticate Wrangler (if needed):

```bash
npx wrangler login
```

3. Start local dev server:

```bash
npm run dev
```

4. Open the local URL printed by Wrangler (usually `http://127.0.0.1:8787`).

5. Try the components:
- Save an optional profile.
- Send intake messages in chat.
- Click **Run Triage** and review progress + SOAP output.
- Use **Voice Input** (browser support required).

## Deploy

```bash
npm run deploy
```

After deploy, place your production URL here:

- Live URL: `<your deployed worker url>`

## Demo Script (30 seconds)

1. Save profile (optional).
2. Enter: `Sore throat 3 days, fever 38.7C, fatigue`.
3. Answer follow-ups.
4. Click **Run Triage**.
5. Show workflow progress + recommendation + SOAP note.

## Submission

- GitHub repo URL: `https://github.com/dirgnic/cf_ai_in_the_clouds`
- Live URL: `<your deployed worker url>`
- AI prompts used: `PROMPTS.md`

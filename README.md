# Clinic Companion - AI Intake + Triage + SOAP Notes on Cloudflare

Clinic Companion is an original, medicine-themed Cloudflare AI app.  
It collects symptom intake, runs triage logic, and generates a SOAP-style note for demo use.

## Assignment Compliance

- Repository prefix: `cf_ai_` (`cf_ai_in_the_clouds`)  
- Project documentation and run instructions: `README.md`  
- AI prompts used: `PROMPTS.md`  
- Original codebase for this submission

## What It Does

1. User enters symptoms in chat (or uses browser voice input).
2. Assistant asks follow-up context (duration, red flags, meds, allergies).
3. User clicks **Run Triage**.
4. Pipeline returns:
   - structured intake case JSON
   - triage recommendation (`self_care` / `schedule_gp` / `urgent`)
   - red flag summary
   - SOAP note draft
5. Session state persists across reloads per session id.

## Requirement Mapping

- LLM: Workers AI via `env.AI.run`, primary model `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with fallback.
- Workflow / coordination: Cloudflare Workflows (`TriageWorkflow`) plus Durable Object session coordination.
- User input (chat/voice): interactive web UI with chat and browser speech recognition.
- Memory / state: Durable Objects (`ChatSessionDO`) storing profile, history, summary, draft case, and last triage.

## Architecture

- `src/index.ts`: routes UI and API requests
- `src/lib/ui.ts`: HTML shell
- `src/lib/client-js.ts`: frontend behavior and API calls
- `src/lib/chat-session-do.ts`: durable state store
- `src/lib/triage-workflow.ts`: triage workflow orchestration
- `src/lib/ai.ts`: model calls, case extraction, SOAP generation
- `src/lib/triage.ts`: deterministic triage rules
- `src/lib/handlers.ts`: endpoint handlers and workflow fallback logic

## API Endpoints

- `POST /api/profile`
- `POST /api/mode`
- `POST /api/chat`
- `POST /api/triage`
- `POST /api/export`
- `POST /api/glossary`
- `POST /api/state`
- `POST /api/reset`

## Local Run (Step-by-Step)

1. Install dependencies:

```bash
npm install
```

2. Authenticate Cloudflare:

```bash
npx wrangler login
```

3. Start preview:

```bash
npm run dev -- --remote
```

4. Open shown URL (commonly `http://localhost:8787`).

Notes:
- `--remote` is recommended for real Workers AI responses.
- In pure local mode, AI bindings may be unavailable and app will return safe fallback responses.

## 30-Second Demo Script

1. Save a profile.
2. Chat: "Sore throat 3 days, fever 38.7, fatigue."
3. Send one or two follow-up messages.
4. Click **Run Triage**.
5. Show workflow progress, recommendation, red flags, and SOAP note.
6. Click **Download SOAP .md**.

## UI Features

- Profile memory form
- Clinic mode toggle (`patient_friendly` / `clinician`)
- Chat and voice input
- Triage progress panel
- SOAP markdown export
- Glossary lookup (partial match + all terms)
- Session state viewer
- Session reset

## Safety and Privacy

- Educational only, not medical advice.
- Do not input real personal health data.
- Stored session data is for demo behavior and can be reset.

## Deploy

```bash
npm run deploy
```

## Submission Links

- GitHub repo: `https://github.com/dirgnic/cf_ai_in_the_clouds`
- Live URL: `<your deployed worker url>`
- AI prompts log: `PROMPTS.md`

## Reference Docs

- Cloudflare Agents quick start: `https://developers.cloudflare.com/agents/getting-started/quick-start/`
- Add Agents to existing project: `https://developers.cloudflare.com/agents/getting-started/add-to-existing-project/`
- Callable methods: `https://developers.cloudflare.com/agents/api-reference/callable-methods/`
- Durable agent workflows: `https://developers.cloudflare.com/workflows/get-started/durable-agents/`
- Workers AI JSON mode: `https://developers.cloudflare.com/workers-ai/features/json-mode/`
- Agents SDK repo: `https://github.com/cloudflare/agents`

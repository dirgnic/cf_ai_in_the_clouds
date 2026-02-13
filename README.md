# Clinic Companion (Cloudflare AI Assignment)

Clinic Companion is an original medicine-themed AI app for intake + triage + SOAP drafting.

## Requirements Coverage

- LLM: Workers AI Llama 3.3 (`env.AI.run`) with JSON-mode extraction
- Workflow / coordination: Cloudflare Workflows (`TriageWorkflow`) + fallback worker pipeline
- User input: chat + browser voice input
- Memory/state: Durable Objects (`ChatSessionDO`) and Agents SDK class (`ClinicAgent`)

## Included Architecture Pieces

- `src/lib/clinic-agent.ts`: Agents SDK `ClinicAgent extends Agent`
- `src/lib/triage-workflow.ts`: Workflow class using `step.do(...)`
- `src/lib/chat-session-do.ts`: session state storage and APIs
- `src/lib/handlers.ts`: API orchestration
- `src/lib/ai.ts`: LLM calls, JSON extraction, SOAP generation
- `src/lib/ui.ts`: frontend chat/voice/progress UI

## Endpoints

- `POST /api/profile`
- `POST /api/mode` (`patient_friendly` or `clinician`)
- `POST /api/chat`
- `POST /api/triage`
- `POST /api/export` (downloadable Markdown content)
- `POST /api/glossary` (term lookup)
- `POST /api/reset`

## Optional Extras Implemented

- Reset session button
- Download SOAP note as Markdown
- Medical glossary lookup tool
- Clinic mode toggle (patient-friendly vs clinician)

## Safety Notice

Educational only, not medical advice.
Do not enter real personal health data.

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Authenticate Wrangler:

```bash
npx wrangler login
```

3. Start locally:

```bash
npm run dev
```

4. Open the local URL from Wrangler.

## Deploy

```bash
npm run deploy
```

## Demo Script (30 sec)

1. Enter symptom details in chat.
2. Optionally save profile and clinic mode.
3. Click **Run Triage**.
4. Show workflow progress and SOAP output.
5. Click **Download SOAP .md**.
6. Show glossary lookup.

## Submission

- GitHub repo URL: `https://github.com/dirgnic/cf_ai_in_the_clouds`
- Live URL: `<your deployed worker url>`
- AI prompts: `PROMPTS.md`

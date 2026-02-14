# Clinic Companion (Cloudflare AI Assignment)

Clinic Companion is an original, medicine-themed AI app for intake, triage, and SOAP note drafting on Cloudflare.

## Compliance Checklist

- Repository prefix: `cf_ai_` (`cf_ai_in_the_clouds`) ✅
- `README.md` with project docs + run instructions ✅
- `PROMPTS.md` with AI prompts used ✅
- Original implementation statement included ✅

## Assignment Requirements Coverage

- LLM: Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) with fallback model ✅
- Workflow/coordination: Cloudflare Workflows (`TriageWorkflow`) + Durable Object coordination ✅
- User input: chat + browser speech-to-text voice input ✅
- Memory/state: Durable Objects session state (`ChatSessionDO`) ✅

## Core Architecture

- `src/index.ts`: request routing, static UI/JS serving, API endpoints
- `src/lib/chat-session-do.ts`: Durable Object state storage
- `src/lib/triage-workflow.ts`: Workflow step orchestration
- `src/lib/clinic-agent.ts`: Agents SDK class (`Agent`)
- `src/lib/ai.ts`: model calls, JSON extraction, SOAP generation
- `src/lib/client-js.ts`: frontend client logic
- `src/lib/ui.ts`: HTML shell

## API Endpoints

- `POST /api/profile`
- `POST /api/mode`
- `POST /api/chat`
- `POST /api/triage`
- `POST /api/export`
- `POST /api/glossary`
- `POST /api/state`
- `POST /api/reset`

## UI Features Implemented

- Profile save form
- Clinic mode toggle (`patient_friendly` / `clinician`)
- Chat + voice input
- Triage run with progress panel
- SOAP markdown export
- Glossary search (partial match + full term list)
- Session state viewer (shows saved profile/history/summary/triage)
- Session reset

## Safety Notice

Educational only, not medical advice.
Do not enter real personal health data.

## Originality Statement

This codebase was implemented specifically for this submission workflow. No external candidate submission code was copied.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Authenticate Wrangler:

```bash
npx wrangler login
```

3. Run local preview:

```bash
npm run dev
```

4. Open local URL from Wrangler (usually `http://localhost:8787`).

## Quick Functional Test

1. Save profile
2. Send one chat message
3. Click **Refresh Session State** and confirm `history` contains messages
4. Click **Run Triage**
5. Download SOAP markdown
6. Test glossary lookup (`tri`)

## Deploy

```bash
npm run deploy
```

After deploy, paste live URL below:

- Live URL: `<your deployed worker url>`

## Submission

- GitHub repo URL: `https://github.com/dirgnic/cf_ai_in_the_clouds`
- Live URL: `<your deployed worker url>`
- AI prompts: `PROMPTS.md`

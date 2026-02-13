export interface Env {
  AI: Ai;
  CHAT_SESSIONS: DurableObjectNamespace<ChatSessionDO>;
}

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: string;
};

type Profile = {
  ageRange?: string;
  sex?: string;
  conditions?: string;
  allergies?: string;
  medications?: string;
};

type CaseData = {
  symptoms: string[];
  duration: string;
  severity: string;
  feverC: number | null;
  redFlags: string[];
  meds: string[];
  allergies: string[];
  notes: string;
};

type TriageResult = {
  recommendation: "self_care" | "schedule_gp" | "urgent";
  reason: string;
  redFlags: string[];
  soapNote: string;
  generatedAt: string;
};

type SessionState = {
  profile: Profile;
  history: ChatMessage[];
  conversationSummary: string;
  draftCase: CaseData | null;
  lastTriage: TriageResult | null;
};

const CHAT_SYSTEM_PROMPT = `You are Clinic Companion, a medical education assistant.
Rules:
- You are not a doctor and cannot diagnose.
- Ask concise follow-up questions when details are missing.
- Focus on practical next steps and safety.
- If severe symptoms appear, advise urgent care.
- End every answer with: "This is educational, not medical advice."`;

export class ChatSessionDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/state") {
      const session = await this.getState();
      return json({ session });
    }

    if (request.method === "POST" && url.pathname === "/append-chat") {
      const body = (await request.json()) as { message?: ChatMessage };
      if (!body.message || !body.message.role || !body.message.content) {
        return json({ error: "Invalid chat message" }, 400);
      }
      const session = await this.getState();
      session.history.push(body.message);
      session.history = session.history.slice(-40);
      await this.saveState(session);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/set-profile") {
      const body = (await request.json()) as { profile?: Profile };
      const session = await this.getState();
      session.profile = {
        ...session.profile,
        ...sanitizeProfile(body.profile || {}),
      };
      await this.saveState(session);
      return json({ ok: true, profile: session.profile });
    }

    if (request.method === "POST" && url.pathname === "/set-summary") {
      const body = (await request.json()) as { conversationSummary?: string };
      const session = await this.getState();
      session.conversationSummary = (body.conversationSummary || "").slice(0, 1200);
      await this.saveState(session);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/set-triage") {
      const body = (await request.json()) as { draftCase?: CaseData; lastTriage?: TriageResult };
      const session = await this.getState();
      session.draftCase = body.draftCase ? normalizeCaseData(body.draftCase) : null;
      session.lastTriage = body.lastTriage ? normalizeTriageResult(body.lastTriage) : null;
      await this.saveState(session);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/reset") {
      await this.saveState(createDefaultState());
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  }

  private async getState(): Promise<SessionState> {
    const state = await this.state.storage.get<SessionState>("session");
    return normalizeSessionState(state);
  }

  private async saveState(session: SessionState): Promise<void> {
    await this.state.storage.put("session", session);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(APP_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/profile") {
      return handleProfile(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/triage") {
      return handleTriage(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/reset") {
      return handleReset(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

async function handleProfile(request: Request, env: Env): Promise<Response> {
  const { sessionId, profile } = (await request.json()) as {
    sessionId?: string;
    profile?: Profile;
  };
  if (!isValidSessionId(sessionId) || !profile) {
    return json({ error: "sessionId and profile are required" }, 400);
  }
  const stub = getSessionStub(env, sessionId);
  const res = await stub.fetch("https://do/set-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  return passthroughJson(res);
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    const { sessionId, message } = (await request.json()) as {
      sessionId?: string;
      message?: string;
    };

    if (!isValidSessionId(sessionId) || !message?.trim()) {
      return json({ error: "sessionId and message are required" }, 400);
    }

    const stub = getSessionStub(env, sessionId);
    const state = await getSessionState(stub);

    const messages = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      {
        role: "system",
        content:
          "Patient profile: " + JSON.stringify(state.profile) +
          "\nConversation summary: " + (state.conversationSummary || "(empty)"),
      },
      ...state.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const aiResult = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages,
      max_tokens: 420,
      temperature: 0.35,
    })) as { response?: string };

    const assistant = aiResult.response?.trim() || "I could not generate a response. Please try again.";
    const now = new Date().toISOString();

    await stub.fetch("https://do/append-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: { role: "user", content: message.trim(), timestamp: now },
      }),
    });

    await stub.fetch("https://do/append-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: { role: "assistant", content: assistant, timestamp: now },
      }),
    });

    const latestState = await getSessionState(stub);
    if (latestState.history.length % 6 === 0) {
      try {
        const summary = await buildConversationSummary(env, latestState.history);
        await stub.fetch("https://do/set-summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationSummary: summary }),
        });
      } catch {
        // Summary refresh is non-critical. Keep chat response successful.
      }
    }

    return json({ reply: assistant });
  } catch (error) {
    return json({ error: toErrorMessage(error) }, 500);
  }
}

async function handleTriage(request: Request, env: Env): Promise<Response> {
  try {
    const { sessionId } = (await request.json()) as { sessionId?: string };
    if (!isValidSessionId(sessionId)) {
      return json({ error: "sessionId is required" }, 400);
    }

    const stub = getSessionStub(env, sessionId);
    const state = await getSessionState(stub);
    if (state.history.length === 0) {
      return json({ error: "No intake history found. Chat first, then run triage." }, 400);
    }

    const progress: string[] = [];
    progress.push("1/3 Extracting structured case...");
    const draftCase = await extractStructuredCase(env, state);

    progress.push("2/3 Applying triage rules...");
    const triage = applyTriageRules(draftCase);

    progress.push("3/3 Generating SOAP note...");
    const soapNote = await generateSoapNote(env, state, draftCase, triage);

    const result: TriageResult = {
      ...triage,
      soapNote,
      generatedAt: new Date().toISOString(),
    };

    await stub.fetch("https://do/set-triage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftCase, lastTriage: result }),
    });

    progress.push("Done");
    return json({ progress, draftCase, triage: result });
  } catch (error) {
    return json({ error: toErrorMessage(error) }, 500);
  }
}

async function handleReset(request: Request, env: Env): Promise<Response> {
  const { sessionId } = (await request.json()) as { sessionId?: string };
  if (!isValidSessionId(sessionId)) {
    return json({ error: "sessionId is required" }, 400);
  }
  const stub = getSessionStub(env, sessionId);
  await stub.fetch("https://do/reset", { method: "POST" });
  return json({ ok: true });
}

function getSessionStub(env: Env, sessionId: string): DurableObjectStub {
  const id = env.CHAT_SESSIONS.idFromName(sessionId);
  return env.CHAT_SESSIONS.get(id);
}

async function getSessionState(stub: DurableObjectStub): Promise<SessionState> {
  const res = await stub.fetch("https://do/state");
  const payload = (await res.json()) as { session: SessionState };
  return normalizeSessionState(payload.session);
}

async function buildConversationSummary(env: Env, history: ChatMessage[]): Promise<string> {
  const recent = history.slice(-14).map((m) => m.role + ": " + m.content).join("\n");
  const result = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      {
        role: "system",
        content:
          "Summarize this medical education chat in <= 120 words with important symptoms, timeline, and open questions.",
      },
      { role: "user", content: recent },
    ],
    max_tokens: 220,
    temperature: 0.2,
  })) as { response?: string };
  return (result.response || "").slice(0, 1200);
}

async function extractStructuredCase(env: Env, state: SessionState): Promise<CaseData> {
  const recentChat = state.history.slice(-20).map((m) => m.role + ": " + m.content).join("\n");

  const prompt =
    "Return only JSON with keys: symptoms(string[]), duration(string), severity(string), feverC(number|null), redFlags(string[]), meds(string[]), allergies(string[]), notes(string). " +
    "Use null for unknown fever. If unknown fields, use empty string/array.\n" +
    "Profile: " + JSON.stringify(state.profile) +
    "\nSummary: " + (state.conversationSummary || "") +
    "\nChat:\n" + recentChat;

  const result = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: "You extract structured medical-intake JSON." },
      { role: "user", content: prompt },
    ],
    max_tokens: 400,
    temperature: 0,
  })) as { response?: string };

  const parsed = parseCaseData(result.response || "");
  return parsed;
}

function parseCaseData(raw: string): CaseData {
  try {
    const maybeJson = extractFirstJsonObject(raw);
    if (!maybeJson) return normalizeCaseData({});

    const obj = JSON.parse(maybeJson) as Partial<CaseData>;
    return normalizeCaseData(obj);
  } catch {
    return normalizeCaseData({});
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 20);
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function normalizeCaseData(input: Partial<CaseData>): CaseData {
  return {
    symptoms: asStringArray(input.symptoms),
    duration: asString(input.duration),
    severity: asString(input.severity),
    feverC: asNullableNumber(input.feverC),
    redFlags: asStringArray(input.redFlags),
    meds: asStringArray(input.meds),
    allergies: asStringArray(input.allergies),
    notes: asString(input.notes),
  };
}

function normalizeTriageResult(input: Partial<TriageResult>): TriageResult {
  const recommendation = input.recommendation;
  const safeRecommendation =
    recommendation === "self_care" || recommendation === "schedule_gp" || recommendation === "urgent"
      ? recommendation
      : "schedule_gp";

  return {
    recommendation: safeRecommendation,
    reason: asString(input.reason),
    redFlags: asStringArray(input.redFlags),
    soapNote: asString(input.soapNote),
    generatedAt: asString(input.generatedAt) || new Date().toISOString(),
  };
}

function sanitizeProfile(profile: Profile): Profile {
  return {
    ageRange: asString(profile.ageRange).slice(0, 80),
    sex: asString(profile.sex).slice(0, 40),
    conditions: asString(profile.conditions).slice(0, 300),
    allergies: asString(profile.allergies).slice(0, 300),
    medications: asString(profile.medications).slice(0, 300),
  };
}

function normalizeSessionState(state: SessionState | undefined): SessionState {
  if (!state) return createDefaultState();
  return {
    profile: sanitizeProfile(state.profile || {}),
    history: Array.isArray(state.history)
      ? state.history
          .filter((m) => m && (m.role === "user" || m.role === "assistant"))
          .map((m) => ({
            role: m.role,
            content: asString(m.content).slice(0, 2000),
            timestamp: asString(m.timestamp),
          }))
          .slice(-40)
      : [],
    conversationSummary: asString(state.conversationSummary).slice(0, 1200),
    draftCase: state.draftCase ? normalizeCaseData(state.draftCase) : null,
    lastTriage: state.lastTriage ? normalizeTriageResult(state.lastTriage) : null,
  };
}

function createDefaultState(): SessionState {
  return {
    profile: {},
    history: [],
    conversationSummary: "",
    draftCase: null,
    lastTriage: null,
  };
}

function isValidSessionId(sessionId?: string): sessionId is string {
  if (!sessionId) return false;
  return sessionId.length >= 8 && sessionId.length <= 128;
}

function applyTriageRules(data: CaseData): Omit<TriageResult, "soapNote" | "generatedAt"> {
  const redFlags = [...data.redFlags];
  const symptoms = data.symptoms.map((s) => s.toLowerCase());

  const hasChestPain = symptoms.some((s) => s.includes("chest pain"));
  const hasBreath = symptoms.some((s) => s.includes("shortness of breath") || s.includes("trouble breathing"));
  const hasNeuro = symptoms.some((s) => s.includes("confusion") || s.includes("fainting"));
  const severeFever = typeof data.feverC === "number" && data.feverC >= 39;

  if (hasChestPain) redFlags.push("Chest pain");
  if (hasBreath) redFlags.push("Breathing difficulty");
  if (hasNeuro) redFlags.push("Neurologic warning signs");
  if (severeFever) redFlags.push("High fever (>=39C)");

  const uniqueRedFlags = Array.from(new Set(redFlags));

  if (uniqueRedFlags.length > 0) {
    return {
      recommendation: "urgent",
      reason: "Potential red flags detected. Prompt in-person assessment is recommended.",
      redFlags: uniqueRedFlags,
    };
  }

  const moderate = data.severity.toLowerCase().includes("moderate") || (typeof data.feverC === "number" && data.feverC >= 38);
  if (moderate) {
    return {
      recommendation: "schedule_gp",
      reason: "Symptoms appear non-emergent but should be evaluated by a clinician soon.",
      redFlags: [],
    };
  }

  return {
    recommendation: "self_care",
    reason: "No immediate red flags found from provided information.",
    redFlags: [],
  };
}

async function generateSoapNote(
  env: Env,
  state: SessionState,
  draftCase: CaseData,
  triage: Omit<TriageResult, "soapNote" | "generatedAt">,
): Promise<string> {
  const result = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      {
        role: "system",
        content:
          "Write a concise SOAP note (educational draft). Include Subjective, Objective (if limited, state that), Assessment, Plan, and a brief safety disclaimer.",
      },
      {
        role: "user",
        content:
          "Profile: " + JSON.stringify(state.profile) +
          "\nCase: " + JSON.stringify(draftCase) +
          "\nTriage: " + JSON.stringify(triage),
      },
    ],
    max_tokens: 520,
    temperature: 0.3,
  })) as { response?: string };

  return result.response?.trim() || "SOAP note unavailable.";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function passthroughJson(response: Response): Promise<Response> {
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const APP_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Clinic Companion</title>
    <style>
      :root {
        --bg: #f4f8f7;
        --surface: #ffffff;
        --ink: #0d2f2f;
        --muted: #4f6f6f;
        --accent: #0f8b8d;
        --accent-2: #4f9d69;
        --border: #d8e4e2;
        --warning: #8b2f2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 20% 0%, #d7edec 0, transparent 32%),
          radial-gradient(circle at 90% 100%, #d8e9d8 0, transparent 30%),
          var(--bg);
      }
      .container {
        max-width: 1080px;
        margin: 0 auto;
        padding: 16px;
      }
      .hero {
        border-radius: 16px;
        color: white;
        padding: 20px;
        background: linear-gradient(120deg, #0f8b8d, #4f9d69);
        box-shadow: 0 8px 20px rgba(15, 139, 141, 0.22);
      }
      .grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px;
      }
      h1, h2, h3 { margin: 0 0 10px; }
      h1 { font-size: 1.65rem; }
      h2 { font-size: 1.1rem; }
      .tiny {
        color: var(--muted);
        font-size: 0.92rem;
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      input, textarea, select {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 9px;
        font: inherit;
      }
      .chat {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .messages {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: #fbfdfd;
        height: 46vh;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bubble {
        max-width: 86%;
        padding: 9px 11px;
        border-radius: 11px;
        white-space: pre-wrap;
        line-height: 1.4;
      }
      .user {
        align-self: flex-end;
        background: #e2f5f6;
        border: 1px solid #bde4e4;
      }
      .assistant {
        align-self: flex-start;
        background: #f4f9f6;
        border: 1px solid #d8ebe0;
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      button {
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .primary { background: var(--accent); color: #fff; }
      .secondary { background: #eaf2f2; color: var(--ink); }
      .triage { background: #e9f3ea; color: #184f2d; }
      .danger { background: #f7e6e6; color: var(--warning); }
      .status { color: var(--muted); min-height: 20px; }
      pre {
        background: #f7fbfb;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        max-height: 30vh;
        overflow: auto;
        margin: 8px 0 0;
      }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
        .messages { height: 38vh; }
        .fields { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="container">
      <section class="hero">
        <h1>Clinic Companion</h1>
        <p>AI intake + triage + SOAP note draft. Educational only, not medical advice.</p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Profile Memory</h2>
          <p class="tiny">Optional profile helps continuity across visits.</p>
          <div class="fields">
            <input id="ageRange" placeholder="Age range (e.g. 25-34)" />
            <input id="sex" placeholder="Sex" />
            <input id="conditions" placeholder="Conditions" />
            <input id="allergies" placeholder="Allergies" />
            <input id="medications" placeholder="Medications" />
          </div>
          <div class="actions" style="margin-top:8px;">
            <button id="saveProfile" class="secondary">Save Profile</button>
          </div>
        </article>

        <article class="card chat">
          <h2>Chat Intake</h2>
          <div id="messages" class="messages"></div>
          <textarea id="prompt" placeholder="Describe symptoms, duration, and what worries you most."></textarea>
          <div class="actions">
            <button id="sendBtn" class="primary">Send</button>
            <button id="voiceBtn" class="secondary">Voice Input</button>
            <button id="triageBtn" class="triage">Run Triage</button>
            <button id="resetBtn" class="danger">Reset</button>
          </div>
          <p id="status" class="status"></p>
        </article>
      </section>

      <section class="grid">
        <article class="card">
          <h3>Workflow Progress</h3>
          <pre id="progressPanel">No triage yet.</pre>
        </article>
        <article class="card">
          <h3>Draft Case + SOAP Output</h3>
          <pre id="resultPanel">Run triage to generate output.</pre>
        </article>
      </section>
    </main>

    <script>
      var messages = document.getElementById('messages');
      var prompt = document.getElementById('prompt');
      var sendBtn = document.getElementById('sendBtn');
      var voiceBtn = document.getElementById('voiceBtn');
      var triageBtn = document.getElementById('triageBtn');
      var resetBtn = document.getElementById('resetBtn');
      var saveProfileBtn = document.getElementById('saveProfile');
      var statusEl = document.getElementById('status');
      var progressPanel = document.getElementById('progressPanel');
      var resultPanel = document.getElementById('resultPanel');

      var sessionIdKey = 'clinic-companion-session-id';
      var sessionId = localStorage.getItem(sessionIdKey);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem(sessionIdKey, sessionId);
      }

      addBubble('assistant', 'Hi. I can gather symptom details, then run triage and draft a SOAP note. This is educational, not medical advice.');

      sendBtn.addEventListener('click', sendMessage);
      triageBtn.addEventListener('click', runTriage);
      resetBtn.addEventListener('click', resetAll);
      saveProfileBtn.addEventListener('click', saveProfile);
      voiceBtn.addEventListener('click', startVoice);

      prompt.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      async function saveProfile() {
        try {
          setStatus('Saving profile...');
          var profile = {
            ageRange: document.getElementById('ageRange').value.trim(),
            sex: document.getElementById('sex').value.trim(),
            conditions: document.getElementById('conditions').value.trim(),
            allergies: document.getElementById('allergies').value.trim(),
            medications: document.getElementById('medications').value.trim()
          };

          var res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, profile: profile })
          });
          var body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Failed to save profile');
          setStatus('Profile saved');
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      async function sendMessage() {
        var text = prompt.value.trim();
        if (!text) return;

        addBubble('user', text);
        prompt.value = '';
        sendBtn.disabled = true;
        setStatus('Thinking...');

        try {
          var res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, message: text })
          });
          var body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Chat failed');
          addBubble('assistant', body.reply);
          setStatus('Done');
        } catch (error) {
          setStatus(error.message || String(error), true);
        } finally {
          sendBtn.disabled = false;
        }
      }

      async function runTriage() {
        triageBtn.disabled = true;
        setStatus('Running triage workflow...');
        progressPanel.textContent = 'Starting...';

        try {
          var res = await fetch('/api/triage', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId })
          });
          var body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Triage failed');

          progressPanel.textContent = body.progress.join('\n');
          resultPanel.textContent = JSON.stringify({
            draftCase: body.draftCase,
            triage: {
              recommendation: body.triage.recommendation,
              reason: body.triage.reason,
              redFlags: body.triage.redFlags,
              generatedAt: body.triage.generatedAt
            },
            soapNote: body.triage.soapNote
          }, null, 2);

          addBubble('assistant', 'Triage complete. I generated a recommendation and SOAP note draft. This is educational, not medical advice.');
          setStatus('Triage complete');
        } catch (error) {
          setStatus(error.message || String(error), true);
        } finally {
          triageBtn.disabled = false;
        }
      }

      async function resetAll() {
        try {
          await fetch('/api/reset', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId })
          });
          messages.innerHTML = '';
          progressPanel.textContent = 'No triage yet.';
          resultPanel.textContent = 'Run triage to generate output.';
          addBubble('assistant', 'Session cleared. Start a new intake when ready.');
          setStatus('Session reset');
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      function startVoice() {
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          setStatus('Speech recognition is not supported in this browser.', true);
          return;
        }

        var recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        setStatus('Listening...');
        recognition.start();

        recognition.onresult = function(event) {
          var transcript = event.results[0][0].transcript;
          prompt.value = prompt.value ? prompt.value + ' ' + transcript : transcript;
          setStatus('Voice captured');
        };

        recognition.onerror = function(event) {
          setStatus('Voice error: ' + event.error, true);
        };
      }

      function addBubble(role, text) {
        var div = document.createElement('div');
        div.className = 'bubble ' + role;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
      }

      function setStatus(text, warn) {
        statusEl.textContent = text;
        statusEl.style.color = warn ? '#8b2f2f' : '#4f6f6f';
      }
    </script>
  </body>
</html>`;

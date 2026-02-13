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
  ageRange: string;
  sex: string;
  conditions: string;
  allergies: string;
  medications: string;
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

type TriageRecommendation = "self_care" | "schedule_gp" | "urgent";

type TriageResult = {
  recommendation: TriageRecommendation;
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

type JsonObject = Record<string, unknown>;

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_HISTORY_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 2000;
const MAX_SUMMARY_CHARS = 1200;

const CHAT_SYSTEM_PROMPT = [
  "You are Clinic Companion, a medical education assistant.",
  "Rules:",
  "- You are not a doctor and cannot diagnose.",
  "- Ask concise follow-up questions if details are missing.",
  "- Focus on practical next steps and safety.",
  "- If severe symptoms appear, advise urgent care.",
  'End every answer with: "This is educational, not medical advice."',
].join("\n");

const CASE_EXTRACT_PROMPT = [
  "Extract medical intake into JSON only.",
  "Return an object with exact keys:",
  "symptoms(string[]), duration(string), severity(string), feverC(number|null),",
  "redFlags(string[]), meds(string[]), allergies(string[]), notes(string).",
  "Use null for unknown fever, and empty arrays/strings for unknown fields.",
].join(" ");

function defaultProfile(): Profile {
  return {
    ageRange: "",
    sex: "",
    conditions: "",
    allergies: "",
    medications: "",
  };
}

function defaultCaseData(): CaseData {
  return {
    symptoms: [],
    duration: "",
    severity: "",
    feverC: null,
    redFlags: [],
    meds: [],
    allergies: [],
    notes: "",
  };
}

function defaultState(): SessionState {
  return {
    profile: defaultProfile(),
    history: [],
    conversationSummary: "",
    draftCase: null,
    lastTriage: null,
  };
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asStringArray(value: unknown, maxItems = 20, maxItemChars = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxItemChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function isValidSessionId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.length >= 8 && value.length <= 128;
}

function normalizeProfile(value: unknown): Profile {
  const obj = isRecord(value) ? value : {};
  return {
    ageRange: asString(obj.ageRange, 80),
    sex: asString(obj.sex, 40),
    conditions: asString(obj.conditions, 300),
    allergies: asString(obj.allergies, 300),
    medications: asString(obj.medications, 300),
  };
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const role = value.role;
  if (role !== "user" && role !== "assistant") return null;
  const content = asString(value.content, MAX_MESSAGE_CHARS);
  if (!content) return null;
  const timestamp = asString(value.timestamp, 80) || new Date().toISOString();
  return { role, content, timestamp };
}

function normalizeCaseData(value: unknown): CaseData {
  const obj = isRecord(value) ? value : {};
  return {
    symptoms: asStringArray(obj.symptoms),
    duration: asString(obj.duration, 200),
    severity: asString(obj.severity, 120),
    feverC: asNullableNumber(obj.feverC),
    redFlags: asStringArray(obj.redFlags),
    meds: asStringArray(obj.meds),
    allergies: asStringArray(obj.allergies),
    notes: asString(obj.notes, 1000),
  };
}

function normalizeRecommendation(value: unknown): TriageRecommendation {
  return value === "self_care" || value === "schedule_gp" || value === "urgent" ? value : "schedule_gp";
}

function normalizeTriageResult(value: unknown): TriageResult | null {
  if (!isRecord(value)) return null;
  return {
    recommendation: normalizeRecommendation(value.recommendation),
    reason: asString(value.reason, 500),
    redFlags: asStringArray(value.redFlags),
    soapNote: asString(value.soapNote, 5000),
    generatedAt: asString(value.generatedAt, 80) || new Date().toISOString(),
  };
}

function normalizeState(value: unknown): SessionState {
  if (!isRecord(value)) return defaultState();

  const history = Array.isArray(value.history)
    ? value.history.map(normalizeMessage).filter((m): m is ChatMessage => Boolean(m)).slice(-MAX_HISTORY_MESSAGES)
    : [];

  return {
    profile: normalizeProfile(value.profile),
    history,
    conversationSummary: asString(value.conversationSummary, MAX_SUMMARY_CHARS),
    draftCase: value.draftCase ? normalizeCaseData(value.draftCase) : null,
    lastTriage: normalizeTriageResult(value.lastTriage),
  };
}

async function safeJson(request: Request): Promise<JsonObject | null> {
  try {
    const body = (await request.json()) as unknown;
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

async function callModel(env: Env, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  const result = (await env.AI.run(MODEL, {
    messages,
    max_tokens: opts?.maxTokens ?? 420,
    temperature: opts?.temperature ?? 0.35,
  })) as { response?: string };
  return (result.response || "").trim();
}

async function callDo<T>(stub: DurableObjectStub, path: string, init?: RequestInit): Promise<T> {
  const response = await stub.fetch("https://do" + path, init);
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { error: raw || "Invalid JSON response" };
  }

  if (!response.ok) {
    const errorMessage = isRecord(body) ? asString(body.error, 500) : "DO request failed";
    throw new Error(errorMessage || "DO request failed");
  }

  return body as T;
}

function getSessionStub(env: Env, sessionId: string): DurableObjectStub {
  const id = env.CHAT_SESSIONS.idFromName(sessionId);
  return env.CHAT_SESSIONS.get(id);
}

async function getSessionState(stub: DurableObjectStub): Promise<SessionState> {
  const payload = await callDo<{ session: unknown }>(stub, "/state");
  return normalizeState(payload.session);
}

async function appendChat(stub: DurableObjectStub, message: ChatMessage): Promise<void> {
  await callDo(stub, "/append-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

async function maybeRefreshSummary(env: Env, stub: DurableObjectStub, history: ChatMessage[]): Promise<void> {
  if (history.length === 0 || history.length % 6 !== 0) return;

  const recent = history.slice(-14).map((m) => m.role + ": " + m.content).join("\n");

  try {
    const summary = await callModel(
      env,
      [
        {
          role: "system",
          content: "Summarize this intake chat in <=120 words with symptoms, timeline, red flags, and open questions.",
        },
        { role: "user", content: recent },
      ],
      { maxTokens: 220, temperature: 0.2 },
    );

    await callDo(stub, "/set-summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationSummary: summary.slice(0, MAX_SUMMARY_CHARS) }),
    });
  } catch {
    // Do not block chat responses on summary refresh failures.
  }
}

async function extractCase(env: Env, state: SessionState): Promise<CaseData> {
  const context = state.history.slice(-20).map((m) => m.role + ": " + m.content).join("\n");

  const raw = await callModel(
    env,
    [
      { role: "system", content: CASE_EXTRACT_PROMPT },
      {
        role: "user",
        content:
          "Profile: " + JSON.stringify(state.profile) +
          "\nConversation summary: " + (state.conversationSummary || "(none)") +
          "\nChat:\n" + context,
      },
    ],
    { maxTokens: 380, temperature: 0 },
  );

  const jsonSlice = extractFirstJsonObject(raw);
  if (!jsonSlice) return defaultCaseData();

  try {
    return normalizeCaseData(JSON.parse(jsonSlice));
  } catch {
    return defaultCaseData();
  }
}

function applyTriageRules(data: CaseData): Omit<TriageResult, "soapNote" | "generatedAt"> {
  const redFlags = new Set(data.redFlags.map((flag) => flag.trim()).filter(Boolean));
  const symptoms = data.symptoms.map((s) => s.toLowerCase());

  if (symptoms.some((s) => s.includes("chest pain"))) redFlags.add("Chest pain");
  if (symptoms.some((s) => s.includes("shortness of breath") || s.includes("trouble breathing"))) redFlags.add("Breathing difficulty");
  if (symptoms.some((s) => s.includes("faint") || s.includes("confusion"))) redFlags.add("Neurologic warning signs");
  if (typeof data.feverC === "number" && data.feverC >= 39) redFlags.add("High fever (>=39C)");

  const list = Array.from(redFlags);
  if (list.length > 0) {
    return {
      recommendation: "urgent",
      reason: "Potential red flags were detected from the provided information.",
      redFlags: list,
    };
  }

  const moderate = data.severity.toLowerCase().includes("moderate") || (typeof data.feverC === "number" && data.feverC >= 38);
  if (moderate) {
    return {
      recommendation: "schedule_gp",
      reason: "Symptoms appear non-emergent but should be reviewed by a clinician soon.",
      redFlags: [],
    };
  }

  return {
    recommendation: "self_care",
    reason: "No immediate red flags were detected from the provided details.",
    redFlags: [],
  };
}

async function generateSoapNote(
  env: Env,
  state: SessionState,
  draftCase: CaseData,
  triage: Omit<TriageResult, "soapNote" | "generatedAt">,
): Promise<string> {
  const note = await callModel(
    env,
    [
      {
        role: "system",
        content:
          "Write a concise educational SOAP note with sections Subjective, Objective, Assessment, Plan, and one-line safety disclaimer.",
      },
      {
        role: "user",
        content:
          "Profile: " + JSON.stringify(state.profile) +
          "\nCase: " + JSON.stringify(draftCase) +
          "\nTriage: " + JSON.stringify(triage),
      },
    ],
    { maxTokens: 520, temperature: 0.3 },
  );

  return note || "SOAP note unavailable.";
}

export class ChatSessionDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/state") {
      const session = normalizeState(await this.state.storage.get("session"));
      return json({ session });
    }

    if (request.method === "POST" && url.pathname === "/append-chat") {
      const body = await safeJson(request);
      const message = normalizeMessage(body?.message);
      if (!message) return json({ error: "Invalid chat message" }, 400);

      const session = normalizeState(await this.state.storage.get("session"));
      session.history.push(message);
      session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
      await this.state.storage.put("session", session);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/set-profile") {
      const body = await safeJson(request);
      const session = normalizeState(await this.state.storage.get("session"));
      session.profile = {
        ...session.profile,
        ...normalizeProfile(body?.profile),
      };
      await this.state.storage.put("session", session);
      return json({ ok: true, profile: session.profile });
    }

    if (request.method === "POST" && url.pathname === "/set-summary") {
      const body = await safeJson(request);
      const session = normalizeState(await this.state.storage.get("session"));
      session.conversationSummary = asString(body?.conversationSummary, MAX_SUMMARY_CHARS);
      await this.state.storage.put("session", session);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/set-triage") {
      const body = await safeJson(request);
      const session = normalizeState(await this.state.storage.get("session"));
      session.draftCase = body?.draftCase ? normalizeCaseData(body.draftCase) : null;
      session.lastTriage = body?.lastTriage ? normalizeTriageResult(body.lastTriage) : null;
      await this.state.storage.put("session", session);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/reset") {
      await this.state.storage.put("session", defaultState());
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(APP_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await safeJson(request);
    if (!body) {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (!isValidSessionId(body.sessionId)) {
      return json({ error: "sessionId is required" }, 400);
    }

    const sessionId = body.sessionId;
    const stub = getSessionStub(env, sessionId);

    try {
      if (url.pathname === "/api/profile") {
        if (!isRecord(body.profile)) return json({ error: "profile is required" }, 400);

        const payload = await callDo<{ profile: Profile }>(stub, "/set-profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profile: body.profile }),
        });
        return json({ ok: true, profile: payload.profile });
      }

      if (url.pathname === "/api/chat") {
        const userText = asString(body.message, MAX_MESSAGE_CHARS);
        if (!userText) return json({ error: "message is required" }, 400);

        const state = await getSessionState(stub);
        const messages = [
          { role: "system" as const, content: CHAT_SYSTEM_PROMPT },
          {
            role: "system" as const,
            content:
              "Patient profile: " + JSON.stringify(state.profile) +
              "\nConversation summary: " + (state.conversationSummary || "(empty)"),
          },
          ...state.history.map((msg) => ({ role: msg.role, content: msg.content })),
          { role: "user" as const, content: userText },
        ];

        const reply =
          (await callModel(env, messages, { maxTokens: 420, temperature: 0.35 })) ||
          "I could not generate a response. Please try again.";

        const timestamp = new Date().toISOString();
        await appendChat(stub, { role: "user", content: userText, timestamp });
        await appendChat(stub, { role: "assistant", content: reply, timestamp });

        const latest = await getSessionState(stub);
        await maybeRefreshSummary(env, stub, latest.history);

        return json({ reply });
      }

      if (url.pathname === "/api/triage") {
        const state = await getSessionState(stub);
        if (state.history.length === 0) {
          return json({ error: "No intake history found. Chat first, then run triage." }, 400);
        }

        const progress: string[] = ["1/3 Extracting structured case..."];
        const draftCase = await extractCase(env, state);

        progress.push("2/3 Applying triage rules...");
        const triageCore = applyTriageRules(draftCase);

        progress.push("3/3 Generating SOAP note...");
        const soapNote = await generateSoapNote(env, state, draftCase, triageCore);

        const triage: TriageResult = {
          ...triageCore,
          soapNote,
          generatedAt: new Date().toISOString(),
        };

        await callDo(stub, "/set-triage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draftCase, lastTriage: triage }),
        });

        progress.push("Done");
        return json({ progress, draftCase, triage });
      }

      if (url.pathname === "/api/reset") {
        await callDo(stub, "/reset", { method: "POST" });
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: toErrorMessage(error) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

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
      .container { max-width: 1080px; margin: 0 auto; padding: 16px; }
      .hero {
        border-radius: 16px;
        color: white;
        padding: 20px;
        background: linear-gradient(120deg, #0f8b8d, #4f9d69);
        box-shadow: 0 8px 20px rgba(15, 139, 141, 0.22);
      }
      .grid { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
      h1, h2, h3 { margin: 0 0 10px; }
      h1 { font-size: 1.65rem; }
      h2 { font-size: 1.1rem; }
      .tiny { color: var(--muted); font-size: 0.92rem; }
      .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      input, textarea {
        width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 9px; font: inherit;
      }
      .chat { display: flex; flex-direction: column; gap: 8px; }
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
      .bubble { max-width: 86%; padding: 9px 11px; border-radius: 11px; white-space: pre-wrap; line-height: 1.4; }
      .user { align-self: flex-end; background: #e2f5f6; border: 1px solid #bde4e4; }
      .assistant { align-self: flex-start; background: #f4f9f6; border: 1px solid #d8ebe0; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      button {
        border: 0; border-radius: 10px; padding: 10px 12px; font-weight: 700; cursor: pointer;
      }
      .primary { background: var(--accent); color: #fff; }
      .secondary { background: #eaf2f2; color: var(--ink); }
      .triage { background: #e9f3ea; color: #184f2d; }
      .danger { background: #f7e6e6; color: var(--warning); }
      .status { color: var(--muted); min-height: 20px; }
      pre {
        background: #f7fbfb; border: 1px solid var(--border); border-radius: 10px;
        padding: 10px; max-height: 30vh; overflow: auto; margin: 8px 0 0;
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

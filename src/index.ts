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

const SYSTEM_PROMPT = `You are MedCloud Guide, a medical education assistant.
Rules:
- Give educational guidance, not diagnosis.
- Ask brief follow-up questions when details are missing.
- Suggest urgent care only when symptoms may be severe.
- Keep responses practical, concise, and clear.
- Always include a short safety note: this is not medical advice.`;

export class ChatSessionDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/history") {
      const history = (await this.state.storage.get<ChatMessage[]>("history")) || [];
      return json({ history });
    }

    if (request.method === "POST" && url.pathname === "/append") {
      const body = (await request.json()) as { message?: ChatMessage };
      if (!body.message || !body.message.role || !body.message.content) {
        return json({ error: "Invalid message" }, 400);
      }

      const history = (await this.state.storage.get<ChatMessage[]>("history")) || [];
      history.push(body.message);

      // Keep last 20 turns to control latency and cost.
      const bounded = history.slice(-40);
      await this.state.storage.put("history", bounded);
      return json({ ok: true, size: bounded.length });
    }

    if (request.method === "POST" && url.pathname === "/reset") {
      await this.state.storage.put("history", []);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
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

    if (request.method === "POST" && url.pathname === "/api/chat") {
      try {
        const { sessionId, message } = (await request.json()) as {
          sessionId?: string;
          message?: string;
        };

        if (!sessionId || !message?.trim()) {
          return json({ error: "sessionId and message are required" }, 400);
        }

        const id = env.CHAT_SESSIONS.idFromName(sessionId);
        const stub = env.CHAT_SESSIONS.get(id);

        const historyRes = await stub.fetch("https://do/history");
        const historyPayload = (await historyRes.json()) as { history: ChatMessage[] };
        const history = historyPayload.history || [];

        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: message.trim() },
        ];

        const aiResult = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          messages,
          max_tokens: 500,
          temperature: 0.4,
        })) as { response?: string };

        const assistant = aiResult.response?.trim() || "I could not generate a response. Please try again.";
        const now = new Date().toISOString();

        await stub.fetch("https://do/append", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              role: "user",
              content: message.trim(),
              timestamp: now,
            },
          }),
        });

        await stub.fetch("https://do/append", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              role: "assistant",
              content: assistant,
              timestamp: now,
            },
          }),
        });

        return json({ reply: assistant });
      } catch (error) {
        return json({ error: toErrorMessage(error) }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/reset") {
      const { sessionId } = (await request.json()) as { sessionId?: string };
      if (!sessionId) {
        return json({ error: "sessionId is required" }, 400);
      }

      const id = env.CHAT_SESSIONS.idFromName(sessionId);
      const stub = env.CHAT_SESSIONS.get(id);
      await stub.fetch("https://do/reset", { method: "POST" });
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

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

const APP_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MedCloud Guide</title>
    <style>
      :root {
        --bg: #f3f8f8;
        --surface: #ffffff;
        --ink: #0e2a2f;
        --muted: #557177;
        --accent: #127475;
        --accent-2: #77b6ea;
        --warn: #a03d3d;
        --border: #d6e3e6;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-rounded, "Avenir Next", "Segoe UI", sans-serif;
        color: var(--ink);
        min-height: 100vh;
        background:
          radial-gradient(circle at 15% 10%, #d5ecef 0, transparent 35%),
          radial-gradient(circle at 85% 90%, #d7e8fb 0, transparent 30%),
          var(--bg);
      }
      .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 24px;
      }
      .hero {
        background: linear-gradient(120deg, #127475, #1f8a70);
        color: white;
        padding: 20px;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(18, 116, 117, 0.22);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.7rem;
      }
      p {
        margin: 0;
        color: inherit;
      }
      .chat {
        margin-top: 16px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
      }
      .messages {
        height: 55vh;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .bubble {
        max-width: 80%;
        padding: 12px 14px;
        border-radius: 14px;
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .user {
        margin-left: auto;
        background: #e0f4f4;
        border: 1px solid #b8dcdc;
      }
      .assistant {
        background: #f5f8fb;
        border: 1px solid #d9e5f2;
      }
      .toolbar {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid var(--border);
      }
      textarea {
        flex: 1;
        resize: vertical;
        min-height: 56px;
        max-height: 140px;
        border-radius: 12px;
        border: 1px solid var(--border);
        padding: 10px;
        font: inherit;
      }
      button {
        border: 0;
        border-radius: 12px;
        padding: 0 14px;
        font-weight: 700;
        cursor: pointer;
      }
      #sendBtn { background: var(--accent); color: #fff; }
      #resetBtn { background: #eef3f7; color: var(--ink); }
      .status {
        margin-top: 8px;
        min-height: 20px;
        color: var(--muted);
        font-size: 0.95rem;
      }
      .warn { color: var(--warn); }
      @media (max-width: 700px) {
        .container { padding: 14px; }
        .messages { height: 60vh; }
        .bubble { max-width: 92%; }
      }
    </style>
  </head>
  <body>
    <main class="container">
      <section class="hero">
        <h1>MedCloud Guide</h1>
        <p>Medicine-focused AI chat for education and next-step guidance. Not for emergencies.</p>
      </section>

      <section class="chat" aria-label="Medical assistant chat">
        <div id="messages" class="messages"></div>
        <div class="toolbar">
          <textarea id="prompt" placeholder="Example: I have a sore throat for 3 days and mild fever."></textarea>
          <button id="sendBtn">Send</button>
          <button id="resetBtn" type="button">Reset</button>
        </div>
      </section>
      <p id="status" class="status"></p>
    </main>

    <script>
      const messages = document.getElementById("messages");
      const prompt = document.getElementById("prompt");
      const sendBtn = document.getElementById("sendBtn");
      const resetBtn = document.getElementById("resetBtn");
      const statusEl = document.getElementById("status");
      const sessionIdKey = "medcloud-session-id";

      let sessionId = localStorage.getItem(sessionIdKey);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem(sessionIdKey, sessionId);
      }

      addBubble("assistant", "Hi, I can help explain symptoms and suggest safe next steps. If this could be an emergency, call local emergency services now.");

      sendBtn.addEventListener("click", () => sendMessage());
      resetBtn.addEventListener("click", () => resetConversation());
      prompt.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      async function sendMessage() {
        const text = prompt.value.trim();
        if (!text) return;

        addBubble("user", text);
        prompt.value = "";
        setStatus("Thinking...");
        sendBtn.disabled = true;

        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId, message: text }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || "Request failed");
          addBubble("assistant", body.reply);
          setStatus("Done");
        } catch (error) {
          setStatus(error.message || String(error), true);
        } finally {
          sendBtn.disabled = false;
        }
      }

      async function resetConversation() {
        try {
          await fetch("/api/reset", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          messages.innerHTML = "";
          addBubble("assistant", "Conversation reset. Ask me a new health question.");
          setStatus("Session reset");
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      function addBubble(role, text) {
        const div = document.createElement("div");
        div.className = "bubble " + role;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
      }

      function setStatus(text, isWarn = false) {
        statusEl.textContent = text;
        statusEl.className = isWarn ? "status warn" : "status";
      }
    </script>
  </body>
</html>`;

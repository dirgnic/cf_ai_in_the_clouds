import { MAX_SUMMARY_CHARS } from "./constants";
import { buildSummary } from "./ai";
import { asString, isRecord, normalizeState } from "./validation";
import type { ChatMessage, ClinicMode, Env, Profile, SessionState } from "./types";

function isDurableObjectHotReloadError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("durable object reset") || m.includes("code was updated");
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callDo<T>(stub: DurableObjectStub, path: string, init?: RequestInit): Promise<T> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
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
        if (attempt < maxAttempts && isDurableObjectHotReloadError(errorMessage || "")) {
          await delay(75);
          continue;
        }
        throw new Error(errorMessage || "DO request failed");
      }

      return body as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts && isDurableObjectHotReloadError(errorMessage)) {
        await delay(75);
        continue;
      }
      throw error;
    }
  }

  throw new Error("DO request failed");
}

export function getSessionStub(env: Env, sessionId: string): DurableObjectStub {
  const id = env.CHAT_SESSIONS.idFromName(sessionId);
  return env.CHAT_SESSIONS.get(id);
}

export async function getSessionState(stub: DurableObjectStub): Promise<SessionState> {
  const payload = await callDo<{ session: unknown }>(stub, "/state");
  return normalizeState(payload.session);
}

export async function appendChat(stub: DurableObjectStub, message: ChatMessage): Promise<void> {
  await callDo(stub, "/append-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

export async function setProfile(stub: DurableObjectStub, profile: Profile): Promise<void> {
  await callDo(stub, "/set-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile }),
  });
}

export async function setMode(stub: DurableObjectStub, mode: ClinicMode): Promise<void> {
  await callDo(stub, "/set-mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export async function setTriage(stub: DurableObjectStub, draftCase: unknown, lastTriage: unknown): Promise<void> {
  await callDo(stub, "/set-triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draftCase, lastTriage }),
  });
}

export async function resetSession(stub: DurableObjectStub): Promise<void> {
  await callDo(stub, "/reset", { method: "POST" });
}

export async function maybeRefreshSummary(env: Env, stub: DurableObjectStub, history: ChatMessage[]): Promise<void> {
  if (history.length === 0 || history.length % 6 !== 0) return;

  try {
    const summary = await buildSummary(env, history);
    await callDo(stub, "/set-summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationSummary: summary.slice(0, MAX_SUMMARY_CHARS) }),
    });
  } catch {
    // Do not block chat response on summary failures.
  }
}

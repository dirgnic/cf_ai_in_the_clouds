import { json, safeJson } from "./http";
import { defaultState, normalizeCaseData, normalizeMessage, normalizeProfile, normalizeState, normalizeTriageResult } from "./validation";

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
      session.history = session.history.slice(-40);
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
      session.conversationSummary = typeof body?.conversationSummary === "string" ? body.conversationSummary.slice(0, 1200) : "";
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

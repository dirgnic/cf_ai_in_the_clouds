import { ChatSessionDO } from "./lib/chat-session-do";
import { getSessionStub } from "./lib/do-client";
import { json, safeJson, toErrorMessage } from "./lib/http";
import { handleChat, handleProfile, handleReset, handleTriage } from "./lib/handlers";
import { APP_HTML } from "./lib/ui";
import { isValidSessionId } from "./lib/validation";
import type { Env } from "./lib/types";

export { ChatSessionDO };

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
    if (!body) return json({ error: "Invalid JSON body" }, 400);
    if (!isValidSessionId(body.sessionId)) return json({ error: "sessionId is required" }, 400);

    const stub = getSessionStub(env, body.sessionId);

    try {
      if (url.pathname === "/api/profile") return handleProfile(body, stub);
      if (url.pathname === "/api/chat") return handleChat(body, env, stub);
      if (url.pathname === "/api/triage") return handleTriage(env, stub);
      if (url.pathname === "/api/reset") return handleReset(stub);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: toErrorMessage(error) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

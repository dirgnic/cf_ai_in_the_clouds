import { ClinicAgent } from "./lib/clinic-agent";
import { ChatSessionDO } from "./lib/chat-session-do";
import { getSessionStub } from "./lib/do-client";
import { json, safeJson, toErrorMessage } from "./lib/http";
import {
  handleChat,
  handleExport,
  handleGlossary,
  handleMode,
  handleProfile,
  handleReset,
  handleState,
  handleTriage,
} from "./lib/handlers";
import { TriageWorkflow } from "./lib/triage-workflow";
import { APP_JS } from "./lib/client-js";
import { APP_HTML } from "./lib/ui";
import { isValidSessionId } from "./lib/validation";
import type { Env } from "./lib/types";

export { ChatSessionDO, ClinicAgent, TriageWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(APP_HTML, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (url.pathname === "/app.js") {
        return new Response(APP_JS, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (url.pathname === "/favicon.ico" || url.pathname === "/apple-touch-icon.png" || url.pathname === "/apple-touch-icon-precomposed.png") {
        return new Response(null, { status: 204 });
      }

      return json({ error: "Not found" }, 404);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await safeJson(request);
    if (!body) return json({ error: "Invalid JSON body" }, 400);

    if (url.pathname === "/api/glossary") {
      return handleGlossary(body);
    }

    if (!isValidSessionId(body.sessionId)) return json({ error: "sessionId is required" }, 400);

    const stub = getSessionStub(env, body.sessionId);

    try {
      if (url.pathname === "/api/profile") return handleProfile(body, stub);
      if (url.pathname === "/api/mode") return handleMode(body, stub);
      if (url.pathname === "/api/chat") return handleChat(body, env, stub);
      if (url.pathname === "/api/triage") return handleTriage(env, stub);
      if (url.pathname === "/api/export") return handleExport(stub);
      if (url.pathname === "/api/state") return handleState(stub);
      if (url.pathname === "/api/reset") return handleReset(stub);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = toErrorMessage(error);
      const lower = message.toLowerCase();
      if (lower.includes("durable object reset") || lower.includes("code was updated")) {
        return json({ error: "Service reloading after code update. Please retry in 1-2 seconds." }, 503);
      }
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

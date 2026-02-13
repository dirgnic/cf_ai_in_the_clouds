import { CHAT_SYSTEM_PROMPT, MAX_MESSAGE_CHARS } from "./constants";
import { callModel, extractCase, generateSoapNote } from "./ai";
import { appendChat, getSessionState, maybeRefreshSummary, resetSession, setProfile, setTriage } from "./do-client";
import { json } from "./http";
import { applyTriageRules } from "./triage";
import { asString, normalizeProfile } from "./validation";
import type { Env, JsonObject, TriageResult } from "./types";

export async function handleProfile(body: JsonObject, stub: DurableObjectStub): Promise<Response> {
  await setProfile(stub, normalizeProfile(body.profile));
  return json({ ok: true });
}

export async function handleChat(body: JsonObject, env: Env, stub: DurableObjectStub): Promise<Response> {
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
    ...state.history.map((m) => ({ role: m.role, content: m.content })),
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

export async function handleTriage(env: Env, stub: DurableObjectStub): Promise<Response> {
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

  await setTriage(stub, draftCase, triage);

  progress.push("Done");
  return json({ progress, draftCase, triage });
}

export async function handleReset(stub: DurableObjectStub): Promise<Response> {
  await resetSession(stub);
  return json({ ok: true });
}

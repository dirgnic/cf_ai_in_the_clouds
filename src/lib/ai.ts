import { CASE_EXTRACT_PROMPT, MAX_SUMMARY_CHARS, MODEL } from "./constants";
import { defaultCaseData, extractFirstJsonObject, normalizeCaseData } from "./validation";
import type { CaseData, ChatMessage, Env, SessionState, TriageResult } from "./types";

export async function callModel(
  env: Env,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const result = (await env.AI.run(MODEL, {
    messages,
    max_tokens: opts?.maxTokens ?? 420,
    temperature: opts?.temperature ?? 0.35,
  })) as { response?: string };

  return (result.response || "").trim();
}

export async function buildSummary(env: Env, history: ChatMessage[]): Promise<string> {
  const recent = history.slice(-14).map((m) => m.role + ": " + m.content).join("\\n");
  const text = await callModel(
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
  return text.slice(0, MAX_SUMMARY_CHARS);
}

export async function extractCase(env: Env, state: SessionState): Promise<CaseData> {
  const context = state.history.slice(-20).map((m) => m.role + ": " + m.content).join("\\n");

  const raw = await callModel(
    env,
    [
      { role: "system", content: CASE_EXTRACT_PROMPT },
      {
        role: "user",
        content:
          "Profile: " + JSON.stringify(state.profile) +
          "\\nConversation summary: " + (state.conversationSummary || "(none)") +
          "\\nChat:\\n" + context,
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

export async function generateSoapNote(
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
          "\\nCase: " + JSON.stringify(draftCase) +
          "\\nTriage: " + JSON.stringify(triage),
      },
    ],
    { maxTokens: 520, temperature: 0.3 },
  );

  return note || "SOAP note unavailable.";
}

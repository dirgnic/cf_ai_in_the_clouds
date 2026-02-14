import { CASE_EXTRACT_PROMPT, FALLBACK_MODEL, MAX_SUMMARY_CHARS, MODEL } from "./constants";
import { defaultCaseData, extractFirstJsonObject, normalizeCaseData } from "./validation";
import type { CaseData, ChatMessage, Env, SessionState, TriageResult } from "./types";

export async function callModel(
  env: Env,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const payload = {
    messages,
    max_tokens: opts?.maxTokens ?? 420,
    temperature: opts?.temperature ?? 0.35,
  };

  try {
    const result = (await env.AI.run(MODEL, payload)) as { response?: string };
    return (result.response || "").trim();
  } catch {
    try {
      const fallback = (await env.AI.run(FALLBACK_MODEL, payload)) as { response?: string };
      return (fallback.response || "").trim();
    } catch {
      return "AI is temporarily unavailable in this local environment. This is educational, not medical advice.";
    }
  }
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

  let raw: { response?: string };
  try {
    raw = (await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: CASE_EXTRACT_PROMPT },
        {
          role: "user",
          content:
            "Profile: " + JSON.stringify(state.profile) +
            "\\nConversation summary: " + (state.conversationSummary || "(none)") +
            "\\nChat:\\n" + context,
        },
      ],
      max_tokens: 380,
      temperature: 0,
      response_format: { type: "json_object" },
    })) as { response?: string };
  } catch {
    try {
      raw = (await env.AI.run(FALLBACK_MODEL, {
        messages: [
          { role: "system", content: CASE_EXTRACT_PROMPT },
          {
            role: "user",
            content:
              "Profile: " + JSON.stringify(state.profile) +
              "\\nConversation summary: " + (state.conversationSummary || "(none)") +
              "\\nChat:\\n" + context,
          },
        ],
        max_tokens: 380,
        temperature: 0,
      })) as { response?: string };
    } catch {
      return defaultCaseData();
    }
  }

  const payload = raw.response || "";
  const jsonSlice = extractFirstJsonObject(payload);
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
  const style = state.clinicMode === "clinician"
    ? "Use concise clinician tone."
    : "Use patient-friendly plain language.";

  const note = await callModel(
    env,
    [
      {
        role: "system",
        content:
          "Write a concise educational SOAP note with sections Subjective, Objective, Assessment, Plan, and one-line safety disclaimer. " + style,
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

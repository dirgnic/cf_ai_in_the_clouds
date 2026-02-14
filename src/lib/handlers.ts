import { CHAT_SYSTEM_PROMPT, MAX_MESSAGE_CHARS } from "./constants";
import { callModel, extractCase, generateSoapNote } from "./ai";
import {
  appendChat,
  getSessionState,
  maybeRefreshSummary,
  resetSession,
  setMode,
  setProfile,
  setTriage,
} from "./do-client";
import { json } from "./http";
import { searchGlossary } from "./glossary";
import { applyTriageRules } from "./triage";
import { asString, defaultState, normalizeMode, normalizeProfile } from "./validation";
import type { Env, JsonObject, TriageResult } from "./types";

type WorkflowTriageValue = {
  progress: string[];
  draftCase: unknown;
  triage: TriageResult;
};

function extractWorkflowValue(result: unknown): unknown {
  if (typeof result === "object" && result !== null && "value" in result) {
    return (result as { value: unknown }).value;
  }
  return result;
}

function isWorkflowTriageValue(value: unknown): value is WorkflowTriageValue {
  if (typeof value !== "object" || value === null) return false;
  const maybe = value as Partial<WorkflowTriageValue>;
  return Array.isArray(maybe.progress) && typeof maybe.triage === "object" && maybe.triage !== null;
}

async function resolveWorkflowResult(instance: unknown): Promise<unknown> {
  if (instance && typeof instance === "object") {
    const maybe = instance as Record<string, unknown>;

    if (typeof maybe.result === "function") {
      return (maybe.result as () => Promise<unknown>)();
    }

    if (typeof maybe.output === "function") {
      return (maybe.output as () => Promise<unknown>)();
    }

    if (maybe.result && typeof (maybe.result as Promise<unknown>).then === "function") {
      return maybe.result;
    }

    if (maybe.output && typeof (maybe.output as Promise<unknown>).then === "function") {
      return maybe.output;
    }
  }

  return instance;
}

async function runLocalTriagePipeline(env: Env, state: ReturnType<typeof defaultState>): Promise<WorkflowTriageValue> {
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

  progress.push("Done");
  return { progress, draftCase, triage };
}

async function tryWorkflowTriage(env: Env, state: ReturnType<typeof defaultState>): Promise<{ value?: WorkflowTriageValue; error?: string }> {
  if (!env.TRIAGE_WORKFLOW) return { error: "Workflow binding not configured" };

  try {
    let instance: unknown;
    try {
      instance = await env.TRIAGE_WORKFLOW.create({ params: { state } });
    } catch {
      // Some preview environments may use a different create payload shape.
      instance = await env.TRIAGE_WORKFLOW.create({ state } as unknown as { params: unknown });
    }

    const raw = await resolveWorkflowResult(instance);
    const extracted = extractWorkflowValue(raw);
    if (!isWorkflowTriageValue(extracted)) {
      return { error: "Unexpected workflow output shape" };
    }
    return { value: extracted };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function handleProfile(body: JsonObject, stub: DurableObjectStub): Promise<Response> {
  await setProfile(stub, normalizeProfile(body.profile));
  return json({ ok: true });
}

export async function handleMode(body: JsonObject, stub: DurableObjectStub): Promise<Response> {
  const mode = normalizeMode(body.mode);
  await setMode(stub, mode);
  return json({ ok: true, mode });
}

export async function handleChat(body: JsonObject, env: Env, stub: DurableObjectStub): Promise<Response> {
  const userText = asString(body.message, MAX_MESSAGE_CHARS);
  if (!userText) return json({ error: "message is required" }, 400);

  let state = defaultState();
  let memoryAvailable = true;
  try {
    state = await getSessionState(stub);
  } catch {
    memoryAvailable = false;
  }

  const styleInstruction = state.clinicMode === "clinician" ? "Use concise clinician language." : "Use plain patient-friendly language.";

  const messages = [
    { role: "system" as const, content: CHAT_SYSTEM_PROMPT + "\n" + styleInstruction },
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

  if (memoryAvailable) {
    try {
      const timestamp = new Date().toISOString();
      await appendChat(stub, { role: "user", content: userText, timestamp });
      await appendChat(stub, { role: "assistant", content: reply, timestamp });

      const latest = await getSessionState(stub);
      await maybeRefreshSummary(env, stub, latest.history);
    } catch {
      memoryAvailable = false;
    }
  }

  return json({
    reply,
    memoryAvailable,
  });
}

export async function handleTriage(env: Env, stub: DurableObjectStub): Promise<Response> {
  const state = await getSessionState(stub);
  if (state.history.length === 0) {
    return json({ error: "No intake history found. Chat first, then run triage." }, 400);
  }

  const workflowAttempt = await tryWorkflowTriage(env, state);
  if (workflowAttempt.value) {
    await setTriage(stub, workflowAttempt.value.draftCase, workflowAttempt.value.triage);
    return json({ ...workflowAttempt.value, workflowUsed: true });
  }

  const fallback = await runLocalTriagePipeline(env, state);
  await setTriage(stub, fallback.draftCase, fallback.triage);
  return json({
    ...fallback,
    workflowUsed: false,
    workflowError: workflowAttempt.error || "Workflow unavailable in this environment",
  });
}

export async function handleExport(stub: DurableObjectStub): Promise<Response> {
  const state = await getSessionState(stub);
  const triage = state.lastTriage;
  if (!triage) return json({ error: "No triage result available yet." }, 400);

  const markdown = [
    "# Clinic Companion SOAP Draft",
    "",
    "Generated: " + triage.generatedAt,
    "",
    "## Recommendation",
    "- " + triage.recommendation,
    "- " + triage.reason,
    "",
    "## Red Flags",
    ...(triage.redFlags.length ? triage.redFlags.map((f) => "- " + f) : ["- None detected"]),
    "",
    "## SOAP Note",
    triage.soapNote,
    "",
    "---",
    "Educational only, not medical advice.",
  ].join("\n");

  return json({ markdown });
}

export function handleGlossary(body: JsonObject): Response {
  const term = asString(body.term, 50).toLowerCase();
  const result = searchGlossary(term);
  return json(result);
}

export async function handleReset(stub: DurableObjectStub): Promise<Response> {
  await resetSession(stub);
  return json({ ok: true });
}

export async function handleState(stub: DurableObjectStub): Promise<Response> {
  try {
    const state = await getSessionState(stub);
    return json({ state });
  } catch {
    return json({ state: defaultState(), degraded: true });
  }
}

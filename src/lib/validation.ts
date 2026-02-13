import { MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS, MAX_SUMMARY_CHARS } from "./constants";
import type { CaseData, ChatMessage, ClinicMode, JsonObject, Profile, SessionState, TriageRecommendation, TriageResult } from "./types";

export function defaultProfile(): Profile {
  return { ageRange: "", sex: "", conditions: "", allergies: "", medications: "" };
}

export function defaultCaseData(): CaseData {
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

export function defaultMode(): ClinicMode {
  return "patient_friendly";
}

export function defaultState(): SessionState {
  return {
    profile: defaultProfile(),
    history: [],
    conversationSummary: "",
    draftCase: null,
    lastTriage: null,
    clinicMode: defaultMode(),
  };
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

export function asString(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function asStringArray(value: unknown, maxItems = 20, maxItemChars = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxItemChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function asNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export function normalizeMode(value: unknown): ClinicMode {
  return value === "clinician" ? "clinician" : "patient_friendly";
}

export function normalizeProfile(value: unknown): Profile {
  const obj = isRecord(value) ? value : {};
  return {
    ageRange: asString(obj.ageRange, 80),
    sex: asString(obj.sex, 40),
    conditions: asString(obj.conditions, 300),
    allergies: asString(obj.allergies, 300),
    medications: asString(obj.medications, 300),
  };
}

export function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const role = value.role;
  if (role !== "user" && role !== "assistant") return null;
  const content = asString(value.content, MAX_MESSAGE_CHARS);
  if (!content) return null;
  const timestamp = asString(value.timestamp, 80) || new Date().toISOString();
  return { role, content, timestamp };
}

export function normalizeCaseData(value: unknown): CaseData {
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

export function normalizeRecommendation(value: unknown): TriageRecommendation {
  return value === "self_care" || value === "schedule_gp" || value === "urgent" ? value : "schedule_gp";
}

export function normalizeTriageResult(value: unknown): TriageResult | null {
  if (!isRecord(value)) return null;
  return {
    recommendation: normalizeRecommendation(value.recommendation),
    reason: asString(value.reason, 500),
    redFlags: asStringArray(value.redFlags),
    soapNote: asString(value.soapNote, 5000),
    generatedAt: asString(value.generatedAt, 80) || new Date().toISOString(),
  };
}

export function normalizeState(value: unknown): SessionState {
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
    clinicMode: normalizeMode(value.clinicMode),
  };
}

export function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

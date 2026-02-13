export interface Env {
  AI: Ai;
  CHAT_SESSIONS: DurableObjectNamespace;
}

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: string;
};

export type Profile = {
  ageRange: string;
  sex: string;
  conditions: string;
  allergies: string;
  medications: string;
};

export type CaseData = {
  symptoms: string[];
  duration: string;
  severity: string;
  feverC: number | null;
  redFlags: string[];
  meds: string[];
  allergies: string[];
  notes: string;
};

export type TriageRecommendation = "self_care" | "schedule_gp" | "urgent";

export type TriageResult = {
  recommendation: TriageRecommendation;
  reason: string;
  redFlags: string[];
  soapNote: string;
  generatedAt: string;
};

export type SessionState = {
  profile: Profile;
  history: ChatMessage[];
  conversationSummary: string;
  draftCase: CaseData | null;
  lastTriage: TriageResult | null;
};

export type JsonObject = Record<string, unknown>;

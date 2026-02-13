export type WorkflowBinding = {
  create: (input: { params: unknown }) => Promise<{ id: string; result: () => Promise<unknown> }>;
};

export interface Env {
  AI: Ai;
  CHAT_SESSIONS: DurableObjectNamespace;
  CLINIC_AGENT?: DurableObjectNamespace;
  TRIAGE_WORKFLOW?: WorkflowBinding;
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

export type ClinicMode = "patient_friendly" | "clinician";

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
  clinicMode: ClinicMode;
};

export type JsonObject = Record<string, unknown>;

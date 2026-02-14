export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const MAX_HISTORY_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_SUMMARY_CHARS = 1200;

export const CHAT_SYSTEM_PROMPT = [
  "You are Clinic Companion, a medical education assistant.",
  "Rules:",
  "- You are not a doctor and cannot diagnose.",
  "- Ask concise follow-up questions if details are missing.",
  "- Focus on practical next steps and safety.",
  "- If severe symptoms appear, advise urgent care.",
  'End every answer with: \"This is educational, not medical advice.\"',
].join("\\n");

export const CASE_EXTRACT_PROMPT = [
  "Extract medical intake into JSON only.",
  "Return an object with exact keys:",
  "symptoms(string[]), duration(string), severity(string), feverC(number|null),",
  "redFlags(string[]), meds(string[]), allergies(string[]), notes(string).",
  "Use null for unknown fever, and empty arrays/strings for unknown fields.",
].join(" ");

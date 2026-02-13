const TERMS: Record<string, string> = {
  triage: "Sorting symptoms by urgency to decide the safest next step.",
  soap: "A standard clinical note format: Subjective, Objective, Assessment, Plan.",
  dyspnea: "Medical term for shortness of breath.",
  tachycardia: "Faster-than-normal resting heart rate.",
  pyrexia: "Another term for fever.",
};

export function listGlossaryTerms(): string[] {
  return Object.keys(TERMS).sort();
}

export function lookupGlossary(term: string): { term: string; definition: string } | null {
  const key = term.trim().toLowerCase();
  if (!key) return null;
  const definition = TERMS[key];
  if (!definition) return null;
  return { term: key, definition };
}

const TERMS: Record<string, string> = {
  triage: "Sorting symptoms by urgency to decide the safest next step.",
  soap: "A standard clinical note format: Subjective, Objective, Assessment, Plan.",
  dyspnea: "Medical term for shortness of breath.",
  tachycardia: "Faster-than-normal resting heart rate.",
  pyrexia: "Another term for fever.",
};

export type GlossaryMatch = {
  term: string;
  definition: string;
};

export function listGlossaryTerms(): string[] {
  return Object.keys(TERMS).sort();
}

export function searchGlossary(term: string): { query: string; terms: string[]; matches: GlossaryMatch[] } {
  const query = term.trim().toLowerCase();
  const terms = listGlossaryTerms();

  if (!query) {
    return {
      query,
      terms,
      matches: terms.map((t) => ({ term: t, definition: TERMS[t] })),
    };
  }

  const matches = terms
    .filter((t) => t.includes(query))
    .map((t) => ({ term: t, definition: TERMS[t] }));

  return { query, terms, matches };
}

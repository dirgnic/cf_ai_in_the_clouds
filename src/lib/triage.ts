import type { CaseData, TriageResult } from "./types";

export function applyTriageRules(data: CaseData): Omit<TriageResult, "soapNote" | "generatedAt"> {
  const redFlags = new Set(data.redFlags.map((flag) => flag.trim()).filter(Boolean));
  const symptoms = data.symptoms.map((s) => s.toLowerCase());

  if (symptoms.some((s) => s.includes("chest pain"))) redFlags.add("Chest pain");
  if (symptoms.some((s) => s.includes("shortness of breath") || s.includes("trouble breathing"))) {
    redFlags.add("Breathing difficulty");
  }
  if (symptoms.some((s) => s.includes("faint") || s.includes("confusion"))) {
    redFlags.add("Neurologic warning signs");
  }
  if (typeof data.feverC === "number" && data.feverC >= 39) {
    redFlags.add("High fever (>=39C)");
  }

  const list = Array.from(redFlags);
  if (list.length > 0) {
    return {
      recommendation: "urgent",
      reason: "Potential red flags were detected from the provided information.",
      redFlags: list,
    };
  }

  const moderate = data.severity.toLowerCase().includes("moderate") || (typeof data.feverC === "number" && data.feverC >= 38);
  if (moderate) {
    return {
      recommendation: "schedule_gp",
      reason: "Symptoms appear non-emergent but should be reviewed by a clinician soon.",
      redFlags: [],
    };
  }

  return {
    recommendation: "self_care",
    reason: "No immediate red flags were detected from the provided details.",
    redFlags: [],
  };
}

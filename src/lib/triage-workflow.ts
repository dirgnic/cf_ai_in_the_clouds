import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { extractCase, generateSoapNote } from "./ai";
import { applyTriageRules } from "./triage";
import type { Env, SessionState, TriageResult } from "./types";

export type TriageWorkflowParams = {
  state: SessionState;
};

export type TriageWorkflowOutput = {
  progress: string[];
  draftCase: SessionState["draftCase"];
  triage: TriageResult;
};

export class TriageWorkflow extends WorkflowEntrypoint<Env, TriageWorkflowParams> {
  async run(event: WorkflowEvent<TriageWorkflowParams>, step: WorkflowStep): Promise<TriageWorkflowOutput> {
    const progress: string[] = [];

    const draftCase = await step.do("extract_case", async () => {
      progress.push("1/3 Extracting structured case...");
      return extractCase(this.env, event.payload.state);
    });

    const triageCore = await step.do("triage_rules", async () => {
      progress.push("2/3 Applying triage rules...");
      return applyTriageRules(draftCase);
    });

    const soapNote = await step.do("soap_note", async () => {
      progress.push("3/3 Generating SOAP note...");
      return generateSoapNote(this.env, event.payload.state, draftCase, triageCore);
    });

    progress.push("Done");

    return {
      progress,
      draftCase,
      triage: {
        ...triageCore,
        soapNote,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

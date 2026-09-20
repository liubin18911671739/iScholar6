/**
 * Submit Config (components/agents/configs/submit/config.ts)
 *
 * Functionality:
 * - Declares the journal-submission agent page config: inputs, output panel, run input mapping, and module layout.
 * - Custom apply creates/reuses a manuscript and stores each recommended journal as a submission.
 *
 * Notes:
 * - Uses customOnApply to persist multiple submission records per run.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createManuscript, createSubmission } from "@/lib/local/hooks";
import type { AgentPageConfig } from "../../agent-page-template";
import type { SubmitOutput } from "@/lib/ai/parse-agent-output";
import { SubmitOutputPanel } from "@/components/agents/outputs/submit-output";
import { SubmitInputs } from "./SubmitInputs";
import { SubmitModuleContent } from "./SubmitModuleContent";

/** Configuration for the journal-submission agent page. */
export const SUBMIT_CONFIG: AgentPageConfig = {
  agentId: "submit",
  InputsComponent: SubmitInputs,
  OutputComponent: SubmitOutputPanel,
  buildRunInput: (fs) => ({
    abstract: fs.abstract,
    keywords: fs.keywords,
    openAccess: fs.openAccess !== "no",
  }),
  // Stores each recommended journal as a local submission on apply.
  customOnApply: async ({ results, projectId, manuscripts, parsedResults, handleApply }) => {
    if (!results || !projectId) return;
    let manuscriptId = manuscripts?.[0]?.id;
    if (!manuscriptId) {
      manuscriptId = await createManuscript({ projectId, title: "Untitled Manuscript" });
    }
    const submitData = parsedResults as SubmitOutput | null;
    if (submitData?.journals?.length) {
      for (const journal of submitData.journals) {
        await createSubmission({ projectId, manuscriptId, journalName: journal.name, coverLetter: journal.rationale });
      }
    }
    handleApply();
  },
  ModuleContentComponent: SubmitModuleContent,
};

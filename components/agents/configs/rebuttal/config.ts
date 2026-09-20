/**
 * Rebuttal Config (components/agents/configs/rebuttal/config.ts)
 *
 * Functionality:
 * - Declares the reviewer-rebuttal agent page config: inputs, output panel, run input mapping, and module layout.
 * - Custom apply creates/reuses a manuscript, submission, and review round, then stores each parsed rebuttal response.
 *
 * Notes:
 * - Uses customOnApply because it needs to persist linked review-round entities, not a manuscript block.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createManuscript, createSubmission, createReviewRound, createRebuttalItem, updateRebuttalItem } from "@/lib/local/hooks";
import type { AgentPageConfig } from "../../agent-page-template";
import type { RebuttalOutput } from "@/lib/ai/parse-agent-output";
import { RebuttalOutputPanel } from "@/components/agents/outputs/rebuttal-output";
import { RebuttalInputs } from "./RebuttalInputs";
import { RebuttalModuleContent } from "./RebuttalModuleContent";

/** Configuration for the reviewer-rebuttal agent page. */
export const REBUTTAL_CONFIG: AgentPageConfig = {
  agentId: "rebuttal",
  InputsComponent: RebuttalInputs,
  OutputComponent: RebuttalOutputPanel,
  buildRunInput: (fs) => ({
    reviewerComments: fs.reviewerComments,
  }),
  // Persists a manuscript, submission, review round, and each parsed rebuttal item.
  customOnApply: async ({ results, projectId, manuscripts, submissions, parsedResults, handleApply, fieldState }) => {
    if (!results || !projectId) return;
    let manuscriptId = manuscripts?.[0]?.id;
    if (!manuscriptId) {
      manuscriptId = await createManuscript({ projectId, title: "Untitled Manuscript" });
    }
    let submissionId = submissions?.[0]?.id;
    if (!submissionId) {
      submissionId = await createSubmission({ projectId, manuscriptId, journalName: "Target Journal" });
    }
    const reviewRoundId = await createReviewRound({ submissionId, roundNumber: 1, reviewText: fieldState.reviewerComments ?? "" });
    const rebuttalData = parsedResults as RebuttalOutput | null;
    if (rebuttalData?.responses?.length) {
      for (const resp of rebuttalData.responses) {
        const id = await createRebuttalItem({ reviewRoundId, reviewerComment: resp.comment });
        await updateRebuttalItem(id, { response: resp.response, changeLocation: resp.changeLocation, evidence: resp.evidence ? { text: resp.evidence } : undefined });
      }
    }
    handleApply();
  },
  ModuleContentComponent: RebuttalModuleContent,
};

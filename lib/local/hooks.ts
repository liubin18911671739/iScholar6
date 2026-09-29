/**
 * Data hooks barrel / backend switch (lib/local/hooks.ts)
 *
 * Functionality:
 * - Preserves the historical `@/lib/local/hooks` import path for all consumers.
 * - Selects research-core hooks from either the legacy Dexie/Supabase layer or the
 *   React Query + BFF layer in `lib/client/hooks` based on `NEXT_PUBLIC_DATA_BACKEND`.
 * - Always re-exports legacy-only hooks (agent runs, training, audit, cost).
 *
 * Notes:
 * - `NEXT_PUBLIC_DATA_BACKEND` is inlined by Next; default is `legacy`.
 * - Kept in sync with `lib/local/hooks/index.ts` (legacy implementation barrel).
 *
 * @author mrpi
 * @date 2026-09-27
 */

import * as legacy from "./hooks/index";
import * as backend from "@/lib/client/hooks";

// Research-core hooks resolve to the backend when the flag is on, legacy otherwise.
const research = process.env.NEXT_PUBLIC_DATA_BACKEND === "backend" ? backend : legacy;

// ── Research core (switchable) ────────────────────────────────────────────
export const useLocalProjects = research.useLocalProjects;
export const useLocalProject = research.useLocalProject;
export const createProject = research.createProject;
export const updateProject = research.updateProject;
export const deleteProject = research.deleteProject;
export const hardDeleteProject = research.hardDeleteProject;

export const useLocalManuscripts = research.useLocalManuscripts;
export const useLocalManuscriptBlocks = research.useLocalManuscriptBlocks;
export const createManuscript = research.createManuscript;
export const updateManuscript = research.updateManuscript;
export const createManuscriptBlock = research.createManuscriptBlock;
export const updateManuscriptBlock = research.updateManuscriptBlock;
export const deleteManuscriptBlock = research.deleteManuscriptBlock;
export const reorderManuscriptBlocks = research.reorderManuscriptBlocks;

export const useManuscriptVersions = research.useManuscriptVersions;
export const useBlockVersions = research.useBlockVersions;
export const rollbackToVersion = research.rollbackToVersion;

export const useLocalBibItems = research.useLocalBibItems;
export const createBibItem = research.createBibItem;
export const updateBibItem = research.updateBibItem;
export const deleteBibItem = research.deleteBibItem;
export const bulkCreateBibItems = research.bulkCreateBibItems;

export const useLocalAttachments = research.useLocalAttachments;
export const useLocalRagChunks = research.useLocalRagChunks;
export const createAttachment = research.createAttachment;
export const updateAttachment = research.updateAttachment;
export const deleteAttachment = research.deleteAttachment;

export const useLocalExperiments = research.useLocalExperiments;
export const createExperiment = research.createExperiment;
export const updateExperiment = research.updateExperiment;
export const deleteExperiment = research.deleteExperiment;

export const useLocalSubmissions = research.useLocalSubmissions;
export const createSubmission = research.createSubmission;
export const updateSubmission = research.updateSubmission;
export const deleteSubmission = research.deleteSubmission;

export const useLocalReviewRounds = research.useLocalReviewRounds;
export const createReviewRound = research.createReviewRound;
export const updateReviewRound = research.updateReviewRound;
export const deleteReviewRound = research.deleteReviewRound;

export const useLocalRebuttalItems = research.useLocalRebuttalItems;
export const createRebuttalItem = research.createRebuttalItem;
export const updateRebuttalItem = research.updateRebuttalItem;
export const deleteRebuttalItem = research.deleteRebuttalItem;

export const useLocalTasks = research.useLocalTasks;
export const createTask = research.createTask;
export const updateTask = research.updateTask;
export const deleteTask = research.deleteTask;

// ── Legacy-only (agent runs / training / audit / cost) ────────────────────
export { now } from "./hooks/index";
export {
  useLocalAgentRuns,
  useLocalAllAgentRuns,
  upsertAgentRun,
  updateAgentRunStatus,
  getLatestApprovedRun,
  getLatestAgentRunInputs,
  useWorkflowProgress,
  useLatestAgentRun,
} from "./hooks/index";
export {
  useTrainingPrograms,
  useTrainingEnrollments,
  useReviewQueue,
  useTrainingClassReport,
  createTrainingProgram,
  enrollLearner,
} from "./hooks/index";
export {
  useTrainingTasks,
  useTrainingSubmissions,
  useEvidenceCards,
  createTrainingTask,
  upsertTrainingSubmission,
  createEvidenceCard,
  updateEvidenceCard,
  createTrainingReview,
  recordAiConsent,
  hasRecentAiConsent,
  getRecentAiConsent,
  useTrainingReportData,
} from "./hooks/index";
export { useLocalAuditEntries } from "./hooks/index";
export type { CostSummary } from "./hooks/index";
export { useCostSummary } from "./hooks/index";

/**
 * Local Hooks Directory Barrel (lib/local/hooks/index.ts)
 *
 * Functionality:
 * - Aggregates every entity hook module under ./hooks/ into one import surface.
 * - Keeps `@/lib/local/hooks` imports working after hooks were split by entity.
 * - Re-exports the shared `now` timestamp helper and the CostSummary type/useCostSummary.
 *
 * Notes:
 * - Side-effect free; all implementations are imported from sibling modules.
 *
 * @author mrpi
 * @date 2026-09-16
 */

// Barrel re-exports — import from "@/lib/local/hooks" as before.
export { now } from "./utils";
export { useLocalProjects, useLocalProject, createProject, updateProject, deleteProject, hardDeleteProject } from "./projects";
export { useLocalManuscripts, useLocalManuscriptBlocks, createManuscript, updateManuscript, createManuscriptBlock, updateManuscriptBlock, deleteManuscriptBlock, reorderManuscriptBlocks } from "./manuscripts";
export { useLocalBibItems, createBibItem, updateBibItem, deleteBibItem, bulkCreateBibItems } from "./bib-items";
export { useLocalAttachments, useLocalRagChunks, createAttachment, updateAttachment, deleteAttachment } from "./attachments";
export { useLocalExperiments, createExperiment, updateExperiment, deleteExperiment } from "./experiments";
export { useLocalSubmissions, createSubmission, updateSubmission, deleteSubmission } from "./submissions";
export { useLocalReviewRounds, createReviewRound, updateReviewRound, deleteReviewRound } from "./review-rounds";
export { useLocalRebuttalItems, createRebuttalItem, updateRebuttalItem, deleteRebuttalItem } from "./rebuttal-items";
export { useLocalAgentRuns, useLocalAllAgentRuns, updateAgentRunStatus, getLatestApprovedRun, getLatestAgentRunInputs, useWorkflowProgress, useLatestAgentRun } from "./agent-runs";
export { useLocalTasks, createTask, updateTask, deleteTask } from "./tasks";
export { useTrainingPrograms, useTrainingEnrollments, useReviewQueue, useTrainingClassReport, createTrainingProgram, enrollLearner } from "./training-admin";
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
} from "./training";
export { useLocalAuditEntries } from "./audit";
export { useManuscriptVersions, useBlockVersions, rollbackToVersion } from "./versions";
export type { CostSummary } from "./cost";
export { useCostSummary } from "./cost";

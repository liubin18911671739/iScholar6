/**
 * Local Hooks Barrel (lib/local/hooks.ts)
 *
 * Functionality:
 * - Re-exports every Dexie/local data hook and mutation helper grouped by entity.
 * - Preserves the historical `@/lib/local/hooks` import path after the split into ./hooks/*.
 * - Surfaces projects, manuscripts, citations, attachments, experiments, submissions, reviews, agent runs, tasks, training, audit, versions, and cost.
 *
 * Notes:
 * - Thin aggregator only; implementations live in the per-entity modules under ./hooks/.
 *
 * @author mrpi
 * @date 2026-09-16
 */

// Barrel re-exports — all hooks are now organized by entity in ./hooks/
// Import paths remain backward-compatible: `from "@/lib/local/hooks"`
export { now } from "./hooks/utils";
export { useLocalProjects, useLocalProject, createProject, updateProject, deleteProject, hardDeleteProject } from "./hooks/projects";
export { useLocalManuscripts, useLocalManuscriptBlocks, createManuscript, updateManuscript, createManuscriptBlock, updateManuscriptBlock, deleteManuscriptBlock, reorderManuscriptBlocks } from "./hooks/manuscripts";
export { useLocalBibItems, createBibItem, updateBibItem, deleteBibItem, bulkCreateBibItems } from "./hooks/bib-items";
export { useLocalAttachments, useLocalRagChunks, createAttachment, updateAttachment, deleteAttachment } from "./hooks/attachments";
export { useLocalExperiments, createExperiment, updateExperiment, deleteExperiment } from "./hooks/experiments";
export { useLocalSubmissions, createSubmission, updateSubmission, deleteSubmission } from "./hooks/submissions";
export { useLocalReviewRounds, createReviewRound, updateReviewRound, deleteReviewRound } from "./hooks/review-rounds";
export { useLocalRebuttalItems, createRebuttalItem, updateRebuttalItem, deleteRebuttalItem } from "./hooks/rebuttal-items";
export { useLocalAgentRuns, useLocalAllAgentRuns, updateAgentRunStatus, getLatestApprovedRun, getLatestAgentRunInputs, useWorkflowProgress, useLatestAgentRun } from "./hooks/agent-runs";
export { useLocalTasks, createTask, updateTask, deleteTask } from "./hooks/tasks";
export { useTrainingPrograms, useTrainingEnrollments, useReviewQueue, useTrainingClassReport, createTrainingProgram, enrollLearner } from "./hooks/training-admin";
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
} from "./hooks/training";
export { useLocalAuditEntries } from "./hooks/audit";
export { useManuscriptVersions, useBlockVersions, rollbackToVersion } from "./hooks/versions";
export type { CostSummary } from "./hooks/cost";
export { useCostSummary } from "./hooks/cost";

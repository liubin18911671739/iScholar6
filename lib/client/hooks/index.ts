/**
 * Backend research hooks barrel (lib/client/hooks/index.ts)
 *
 * Functionality:
 * - Aggregates the React Query hooks that talk to `/api/data/*`.
 * - Exposes the same names as the legacy `lib/local/hooks/*` research modules so the
 *   resolver barrel can switch implementations behind `NEXT_PUBLIC_DATA_BACKEND`.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

export { useLocalProjects, useLocalProject, createProject, updateProject, deleteProject, hardDeleteProject } from "./projects";
export {
  useLocalManuscripts,
  useLocalManuscriptBlocks,
  createManuscript,
  updateManuscript,
  createManuscriptBlock,
  updateManuscriptBlock,
  deleteManuscriptBlock,
  reorderManuscriptBlocks,
} from "./manuscripts";
export { useManuscriptVersions, useBlockVersions, rollbackToVersion } from "./versions";
export { useLocalBibItems, createBibItem, updateBibItem, deleteBibItem, bulkCreateBibItems } from "./bib-items";
export {
  useLocalAttachments,
  useLocalRagChunks,
  createAttachment,
  updateAttachment,
  deleteAttachment,
} from "./attachments";
export { useLocalExperiments, createExperiment, updateExperiment, deleteExperiment } from "./experiments";
export { useLocalSubmissions, createSubmission, updateSubmission, deleteSubmission } from "./submissions";
export { useLocalReviewRounds, createReviewRound, updateReviewRound, deleteReviewRound } from "./review-rounds";
export {
  useLocalRebuttalItems,
  createRebuttalItem,
  updateRebuttalItem,
  deleteRebuttalItem,
} from "./rebuttal-items";
export { useLocalTasks, createTask, updateTask, deleteTask } from "./tasks";

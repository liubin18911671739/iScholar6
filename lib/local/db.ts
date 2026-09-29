/**
 * Local Dexie Database (lib/local/db.ts)
 *
 * Functionality:
 * - Defines the versioned Dexie schema through v4 and exports the singleton `localDB`.
 * - Mirrors creating/updating/deleting hooks to Supabase via `syncLocalMutation`.
 *
 * Notes:
 * - Browser-only; owns all local persistence and reactive cache behavior.
 * - Record interfaces now live in `lib/types/domain.ts` and are re-exported here.
 * - Schema changes must be added as new Dexie versions to preserve upgrade paths.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import Dexie, { type Table } from "dexie";
import { syncLocalMutation } from "@/lib/supabase/collaborative";
import type {
  LocalAgentRun,
  LocalAiConsent,
  LocalAttachment,
  LocalAuditEntry,
  LocalBibItem,
  LocalEvidenceCard,
  LocalExperiment,
  LocalManuscript,
  LocalManuscriptBlock,
  LocalManuscriptVersion,
  LocalPluginInstall,
  LocalProject,
  LocalPromptPackSelection,
  LocalRagChunk,
  LocalRebuttalItem,
  LocalReviewRound,
  LocalSubmission,
  LocalTask,
  LocalTrainingEnrollment,
  LocalTrainingProgram,
  LocalTrainingReview,
  LocalTrainingSubmission,
  LocalTrainingTask,
} from "@/lib/types/domain";

export * from "@/lib/types/domain";

// ── Database ────────────────────────────────────────────────────────────

// Dexie subclass declaring every table and the versioned schema.
class IScholarLocalDB extends Dexie {
  projects!: Table<LocalProject>;
  manuscripts!: Table<LocalManuscript>;
  manuscriptBlocks!: Table<LocalManuscriptBlock>;
  bibItems!: Table<LocalBibItem>;
  attachments!: Table<LocalAttachment>;
  ragChunks!: Table<LocalRagChunk>;
  experiments!: Table<LocalExperiment>;
  submissions!: Table<LocalSubmission>;
  reviewRounds!: Table<LocalReviewRound>;
  rebuttalItems!: Table<LocalRebuttalItem>;
  agentRuns!: Table<LocalAgentRun>;
  manuscriptVersions!: Table<LocalManuscriptVersion>;
  auditLedger!: Table<LocalAuditEntry>;
  tasks!: Table<LocalTask>;
  trainingPrograms!: Table<LocalTrainingProgram>;
  trainingTasks!: Table<LocalTrainingTask>;
  trainingSubmissions!: Table<LocalTrainingSubmission>;
  evidenceCards!: Table<LocalEvidenceCard>;
  trainingReviews!: Table<LocalTrainingReview>;
  aiConsents!: Table<LocalAiConsent>;
  enrollments!: Table<LocalTrainingEnrollment>;
  pluginInstalls!: Table<LocalPluginInstall>;
  promptPackSelections!: Table<LocalPromptPackSelection>;

  constructor() {
    super("ischolar-v6-local");
    this.version(1).stores({
      projects: "id, status, updatedAt",
      manuscripts: "id, projectId, status",
      manuscriptBlocks: "id, manuscriptId, section, order",
      bibItems: "id, projectId, year, doi",
      attachments: "id, projectId, bibItemId",
      ragChunks: "id, bibItemId, chunkIndex",
      experiments: "id, projectId, createdAt",
      submissions: "id, projectId, manuscriptId, status",
      reviewRounds: "id, submissionId, roundNumber",
      rebuttalItems: "id, reviewRoundId",
      agentRuns: "id, projectId, agent, status, startedAt",
      auditLedger: "id, projectId, timestamp",
      tasks: "id, projectId, status",
    });

    this.version(2).stores({
      projects: "id, status, updatedAt",
      manuscripts: "id, projectId, status",
      manuscriptBlocks: "id, manuscriptId, section, order",
      bibItems: "id, projectId, year, doi",
      attachments: "id, projectId, bibItemId",
      ragChunks: "id, bibItemId, chunkIndex",
      experiments: "id, projectId, createdAt",
      submissions: "id, projectId, manuscriptId, status",
      reviewRounds: "id, submissionId, roundNumber",
      rebuttalItems: "id, reviewRoundId",
      agentRuns: "id, projectId, agent, status, startedAt",
      manuscriptVersions: "id, manuscriptId, blockId, version, createdAt",
      auditLedger: "id, projectId, timestamp",
      tasks: "id, projectId, status",
    });

    this.version(3).stores({
      projects: "id, status, updatedAt",
      manuscripts: "id, projectId, status",
      manuscriptBlocks: "id, manuscriptId, section, order",
      bibItems: "id, projectId, year, doi",
      attachments: "id, projectId, bibItemId",
      ragChunks: "id, bibItemId, chunkIndex",
      experiments: "id, projectId, createdAt",
      submissions: "id, projectId, manuscriptId, status",
      reviewRounds: "id, submissionId, roundNumber",
      rebuttalItems: "id, reviewRoundId",
      agentRuns: "id, projectId, agent, status, startedAt, mode, trainingTaskId",
      manuscriptVersions: "id, manuscriptId, blockId, version, createdAt",
      auditLedger: "id, projectId, timestamp",
      tasks: "id, projectId, status",
      trainingPrograms: "id, discipline, updatedAt",
      trainingTasks: "id, projectId, programId, status, dimension, updatedAt",
      trainingSubmissions: "id, taskId, projectId, status, updatedAt",
      evidenceCards: "id, submissionId, projectId, verificationStatus, updatedAt",
      trainingReviews: "id, submissionId, createdAt",
      aiConsents: "id, projectId, trainingTaskId, consentedAt",
      enrollments: "id, programId, learnerId, status",
    });

    // v4: local-only plugin system (not in DEXIE_TO_REMOTE_TABLE)
    this.version(4).stores({
      projects: "id, status, updatedAt",
      manuscripts: "id, projectId, status",
      manuscriptBlocks: "id, manuscriptId, section, order",
      bibItems: "id, projectId, year, doi",
      attachments: "id, projectId, bibItemId",
      ragChunks: "id, bibItemId, chunkIndex",
      experiments: "id, projectId, createdAt",
      submissions: "id, projectId, manuscriptId, status",
      reviewRounds: "id, submissionId, roundNumber",
      rebuttalItems: "id, reviewRoundId",
      agentRuns: "id, projectId, agent, status, startedAt, mode, trainingTaskId",
      manuscriptVersions: "id, manuscriptId, blockId, version, createdAt",
      auditLedger: "id, projectId, timestamp",
      tasks: "id, projectId, status",
      trainingPrograms: "id, discipline, updatedAt",
      trainingTasks: "id, projectId, programId, status, dimension, updatedAt",
      trainingSubmissions: "id, taskId, projectId, status, updatedAt",
      evidenceCards: "id, submissionId, projectId, verificationStatus, updatedAt",
      trainingReviews: "id, submissionId, createdAt",
      aiConsents: "id, projectId, trainingTaskId, consentedAt",
      enrollments: "id, programId, learnerId, status",
      pluginInstalls: "id, enabled, updatedAt",
      promptPackSelections: "id, packRef, updatedAt",
    });
  }
}

/** Singleton local database instance used across the app. */
export const localDB = new IScholarLocalDB();

// Collaborative mode uses IndexedDB as the reactive cache, while every core
// mutation is mirrored to Supabase. Fire-and-forget keeps Dexie transactions
// responsive; failures are logged and can be retried by the migration worker.
localDB.tables.forEach((table) => {
  table.hook("creating").subscribe((_primKey, obj) => {
    void syncLocalMutation(table.name, obj as Record<string, unknown>, "upsert");
  });
  table.hook("updating").subscribe((mods, primKey, obj) => {
    void syncLocalMutation(table.name, { ...(obj as Record<string, unknown>), ...mods, id: primKey }, "upsert");
  });
  table.hook("deleting").subscribe((primKey, obj) => {
    void syncLocalMutation(table.name, { ...(obj as Record<string, unknown>), id: primKey }, "delete");
  });
});

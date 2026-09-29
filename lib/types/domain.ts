/**
 * Domain types (lib/types/domain.ts)
 *
 * Functionality:
 * - Single neutral home for every research/training/plugin record shape.
 * - Contains no Dexie/Supabase imports so both the legacy and backend data
 *   layers can depend on it while the migration completes.
 *
 * Notes:
 * - Formerly declared in `lib/local/db.ts`; that module now re-exports these.
 *
 * @author mrpi
 * @date 2026-09-28
 */

import type { AgentId } from "@/lib/ai/agents/registry";

// ── Metadata / Helper Interfaces ──────────────────────────────────────────

/** Free-form extras stored on a project. */
export interface ProjectMetadata {
  tags?: string[];
  notes?: string;
  [key: string]: unknown;
}

/** Free-form extras stored on a bibliography item. */
export interface BibItemMetadata {
  method?: string;
  source?: string;
  [key: string]: unknown;
}

/** Free-form parameters for an experiment. */
export interface ExperimentParams {
  collectionMethod?: string;
  [key: string]: unknown;
}

/** Evidence supporting a rebuttal response. */
export interface RebuttalEvidence {
  text?: string;
  url?: string;
  [key: string]: unknown;
}

// ── Interfaces ──────────────────────────────────────────────────────────

/** A research project and its lifecycle status. */
export interface LocalProject {
  id: string;
  name: string;
  discipline?: string;
  goal?: string;
  status: "draft" | "active" | "submitted" | "archived";
  encryptionKeyRef?: string;
  metadata?: ProjectMetadata;
  createdAt: string;
  updatedAt: string;
}

/** A manuscript belonging to a project. */
export interface LocalManuscript {
  id: string;
  projectId: string;
  title: string;
  abstract?: string;
  currentVersion?: number;
  targetJournal?: string;
  status?: string;
  updatedAt: string;
}

/** An ordered section/content block within a manuscript. */
export interface LocalManuscriptBlock {
  id: string;
  manuscriptId: string;
  section: string;
  order: number;
  content: string;
  version?: number;
  authorType?: string;
  agentRunId?: string;
  updatedAt: string;
}

/** A bibliography/citation item with optional embedding data. */
export interface LocalBibItem {
  id: string;
  projectId: string;
  doi?: string;
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  keywords?: string[];
  citationCount?: number;
  embeddingData?: ArrayBuffer | null;
  metadata?: BibItemMetadata;
  createdAt: string;
}

/** A stored file attachment, optionally encrypted. */
export interface LocalAttachment {
  id: string;
  projectId: string;
  bibItemId?: string;
  filename: string;
  data?: Blob | null;
  contentHash?: string;
  mimeType?: string;
  sizeBytes?: number;
  encrypted?: boolean;
  createdAt: string;
}

/** A chunk of a bibliography item used for retrieval. */
export interface LocalRagChunk {
  id: string;
  bibItemId: string;
  chunkIndex: number;
  content: string;
  embeddingData?: ArrayBuffer | null;
}

/** A recorded experiment with dataset, params, and results. */
export interface LocalExperiment {
  id: string;
  projectId: string;
  name: string;
  dataset?: string;
  params?: ExperimentParams;
  results?: Record<string, unknown>; // truly dynamic — varies per experiment
  scriptBlobUrl?: string;
  createdAt: string;
}

/** A journal submission tied to a manuscript. */
export interface LocalSubmission {
  id: string;
  projectId: string;
  manuscriptId: string;
  journalName: string;
  coverLetter?: string;
  fileTree?: Record<string, unknown>;
  submittedAt?: string;
  status?: string;
}

/** One review round of a submission. */
export interface LocalReviewRound {
  id: string;
  submissionId: string;
  roundNumber: number;
  decision?: string;
  reviewText?: string;
  deadline?: string;
}

/** A single rebuttal response to a reviewer comment. */
export interface LocalRebuttalItem {
  id: string;
  reviewRoundId: string;
  reviewerComment: string;
  response?: string;
  changeLocation?: string;
  evidence?: RebuttalEvidence;
}

/** A single agent execution with inputs, outputs, usage, and status. */
export interface LocalAgentRun {
  id: string;
  projectId: string;
  agent: AgentId;
  status: "queued" | "running" | "needs_review" | "approved" | "applied" | "rejected" | "failed";
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  modelName?: string;
  tokenIn?: number;
  tokenOut?: number;
  costCents?: number;
  latencyMs?: number;
  startedAt: string;
  endedAt?: string;
  mode?: "coach" | "production";
  trainingTaskId?: string;
  consentId?: string;
}

/** An immutable snapshot of a manuscript block with a content hash. */
export interface LocalManuscriptVersion {
  id: string;
  manuscriptId: string;
  blockId?: string;
  version: number;
  content: string;
  authorType?: string;
  agentRunId?: string;
  createdAt: string;
  contentHash: string;
}

/** A hash-chained audit record for a project action. */
export interface LocalAuditEntry {
  id: string;
  projectId: string;
  agentRunId?: string;
  actor?: string;
  action: string;
  promptHash?: string;
  inputHash?: string;
  outputHash?: string;
  consentId?: string;
  parentHash?: string;
  chainHash?: string;
  timestamp: string;
}

/** A lightweight task within a project. */
export interface LocalTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  assignee?: string;
  dueDate?: string;
  createdBy?: string;
}

/** Whether a training task runs in guided coach mode or free production mode. */
export type TrainingMode = "coach" | "production";
/** Competency dimension a training task targets. */
export type TrainingDimension =
  | "ai-literacy"
  | "critical-evaluation"
  | "data-governance"
  | "academic-ethics"
  | "collaboration";
/** Lifecycle status of a training task or submission. */
export type TrainingTaskStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "needs_review"
  | "reviewed"
  | "completed";

/** A training program (cohort) definition. */
export interface LocalTrainingProgram {
  id: string;
  name: string;
  description?: string;
  discipline?: string;
  createdAt: string;
  updatedAt: string;
  cohortName?: string;
  startDate?: string;
  endDate?: string;
  maxMembers?: number;
  status?: "draft" | "active" | "archived";
}

/** A learner's enrollment in a training program. */
export interface LocalTrainingEnrollment {
  id: string;
  programId: string;
  learnerId: string;
  displayName?: string;
  joinedAt: string;
  status: "active" | "completed" | "removed";
  role?: "learner" | "ta";
}

/** A structured training task assigned to learners. */
export interface LocalTrainingTask {
  id: string;
  programId?: string;
  projectId: string;
  title: string;
  description: string;
  agent?: AgentId;
  dimension: TrainingDimension;
  steps: string[];
  status: TrainingTaskStatus;
  requiresReview?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A learner's answers and reflection submitted for a training task. */
export interface LocalTrainingSubmission {
  id: string;
  taskId: string;
  projectId: string;
  answers: Record<string, string>;
  reflection?: string;
  status: TrainingTaskStatus;
  submittedAt?: string;
  updatedAt: string;
}

/** A claim linked to a source for evidence-verification exercises. */
export interface LocalEvidenceCard {
  id: string;
  submissionId: string;
  projectId: string;
  claim: string;
  sourceExcerpt?: string;
  sourceUrl?: string;
  bibItemId?: string;
  verificationStatus: "unverified" | "verified" | "unsupported" | "incorrect_source";
  evidenceStrength?: "strong" | "medium" | "weak";
  userNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** A reviewer's decision and feedback on a training submission. */
export interface LocalTrainingReview {
  id: string;
  submissionId: string;
  reviewer: string;
  decision: "approved" | "needs_revision" | "escalated";
  feedback?: string;
  score?: number;
  createdAt: string;
}

/** Contexts in which external-AI consent can be granted. */
export type AiConsentPurpose = "agent_run" | "training_submit" | "mcp_tool" | "export";

/** A record of user consent to send data to external AI services. */
export interface LocalAiConsent {
  id: string;
  projectId: string;
  /** Camp id when consent is for training submit / camp audit. */
  programId?: string;
  trainingTaskId?: string;
  purpose?: AiConsentPurpose;
  dataCategories: string[];
  externalServices: string[];
  redactionConfirmed: boolean;
  /** Counts-only sensitive scan at consent time (no raw PII). */
  sensitiveScan?: { total: number; byCategory: Record<string, number> };
  consentedAt: string;
}

/** A plugin install row. */
export type { LocalPluginInstall } from "@/lib/plugins/types";

/** Per-agent active prompt pack selection. */
export type { LocalPromptPackSelection } from "@/lib/plugins/types";

/**
 * Canonical camelCase (Dexie) ↔ snake_case (Supabase) mapping for collaborative mode.
 *
 * Functionality:
 * - Exposes `DEXIE_TO_REMOTE_TABLE` and `REMOTE_COLUMN_MAP` for table/column translation.
 * - Converts rows both ways via `toRemoteRecord` / `fromRemoteRecord`.
 * - Drops binary/local-only fields listed in `REMOTE_OMIT_KEYS` before remote writes.
 *
 * Notes:
 * - Pure helpers shared by the collaborative sync and remote query layers.
 *
 * When adding a field that must sync remotely:
 * 1. Add a SQL migration under `supabase/migrations/`.
 * 2. Extend `REMOTE_COLUMN_MAP` (and `DEXIE_TO_REMOTE_TABLE` if a new table).
 * 3. Update `doc/database.md`.
 * 4. Add/adjust regression tests in `__tests__/lib/supabase/field-map.test.ts`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Dexie table name → Supabase table name */
export const DEXIE_TO_REMOTE_TABLE: Record<string, string> = {
  projects: "projects",
  manuscripts: "manuscripts",
  manuscriptBlocks: "manuscript_blocks",
  manuscriptVersions: "manuscript_versions",
  bibItems: "bib_items",
  attachments: "attachments",
  ragChunks: "rag_chunks",
  experiments: "experiments",
  submissions: "submissions",
  reviewRounds: "review_rounds",
  rebuttalItems: "rebuttal_items",
  agentRuns: "agent_runs",
  auditLedger: "audit_ledger",
  tasks: "tasks",
  trainingTasks: "training_tasks",
  evidenceCards: "evidence_cards",
};

/**
 * camelCase local field → snake_case remote column.
 * Keys not listed pass through unchanged (already snake_case or shared names).
 * Special case: Dexie `order` maps to Postgres `ordinal` (reserved-word-safe).
 */
export const REMOTE_COLUMN_MAP: Record<string, string> = {
  order: "ordinal",
  projectId: "project_id",
  manuscriptId: "manuscript_id",
  blockId: "block_id",
  bibItemId: "bib_item_id",
  submissionId: "submission_id",
  reviewRoundId: "review_round_id",
  agentRunId: "agent_run_id",
  taskId: "task_id",
  trainingTaskId: "training_task_id",
  consentId: "consent_id",
  modelName: "model_name",
  tokenIn: "token_in",
  tokenOut: "token_out",
  costCents: "cost_cents",
  latencyMs: "latency_ms",
  startedAt: "started_at",
  endedAt: "ended_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
  currentVersion: "current_version",
  targetJournal: "target_journal",
  authorType: "author_type",
  contentHash: "content_hash",
  promptHash: "prompt_hash",
  inputHash: "input_hash",
  outputHash: "output_hash",
  parentHash: "parent_hash",
  dueDate: "due_date",
  roundNumber: "round_number",
  reviewText: "review_text",
  reviewerComment: "reviewer_comment",
  changeLocation: "change_location",
  fileTree: "file_tree",
  submittedAt: "submitted_at",
  scriptBlobUrl: "script_blob_url",
  citationCount: "citation_count",
  sizeBytes: "size_bytes",
  mimeType: "mime_type",
  storagePath: "storage_path",
  chunkIndex: "chunk_index",
  createdBy: "created_by",
  ownerId: "owner_id",
  programId: "program_id",
  learnerId: "learner_id",
  joinedAt: "joined_at",
  consentedAt: "consented_at",
  dataCategories: "data_categories",
  externalServices: "external_services",
  redactionConfirmed: "redaction_confirmed",
  sensitiveScan: "sensitive_scan",
  purpose: "purpose",
  verificationStatus: "verification_status",
  evidenceStrength: "evidence_strength",
  sourceExcerpt: "source_excerpt",
  sourceUrl: "source_url",
  userNote: "user_note",
  encryptionKeyRef: "encryption_key_ref",
  coverLetter: "cover_letter",
  journalName: "journal_name",
  displayName: "display_name",
  cohortName: "cohort_name",
  startDate: "start_date",
  endDate: "end_date",
};

/** Binary / local-only blobs that must never be upserted to Postgres rows. */
export const REMOTE_OMIT_KEYS = new Set(["data", "embeddingData"]);

/**
 * Convert a Dexie/local row into a Supabase-friendly record.
 * Drops blob fields and renames mapped keys to snake_case.
 */
export function toRemoteRecord(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !REMOTE_OMIT_KEYS.has(key))
      .map(([key, value]) => [REMOTE_COLUMN_MAP[key] ?? key, value])
  );
}

/**
 * Best-effort reverse map for common remote columns used by read hooks.
 * Unmapped keys are left as-is; callers may still read snake_case fields.
 */
export function fromRemoteRecord(row: Record<string, unknown>): Record<string, unknown> {
  const reverse = Object.fromEntries(
    Object.entries(REMOTE_COLUMN_MAP).map(([local, remote]) => [remote, local])
  );
  const out: Record<string, unknown> = { ...row };
  for (const [remote, local] of Object.entries(reverse)) {
    if (remote in row && !(local in out)) {
      out[local] = row[remote];
    }
  }
  // Prefer camelCase aliases used across the app (explicit for hot paths).
  if (row.project_id != null) out.projectId = row.project_id;
  if (row.manuscript_id != null) out.manuscriptId = row.manuscript_id;
  if (row.block_id != null) out.blockId = row.block_id;
  if (row.bib_item_id != null) out.bibItemId = row.bib_item_id;
  if (row.submission_id != null) out.submissionId = row.submission_id;
  if (row.review_round_id != null) out.reviewRoundId = row.review_round_id;
  if (row.task_id != null) out.taskId = row.task_id;
  if (row.training_task_id != null) out.trainingTaskId = row.training_task_id;
  if (row.program_id != null) out.programId = row.program_id;
  if (row.learner_id != null) out.learnerId = row.learner_id;
  if (row.created_at != null) out.createdAt = row.created_at;
  if (row.updated_at != null) out.updatedAt = row.updated_at;
  if (row.owner_id != null) out.ownerId = row.owner_id;
  if (row.started_at != null) out.startedAt = row.started_at;
  if (row.ended_at != null) out.endedAt = row.ended_at;
  if (row.model_name != null) out.modelName = row.model_name;
  if (row.token_in != null) out.tokenIn = row.token_in;
  if (row.token_out != null) out.tokenOut = row.token_out;
  if (row.cost_cents != null) out.costCents = row.cost_cents;
  if (row.latency_ms != null) out.latencyMs = row.latency_ms;
  if (row.agent_run_id != null) out.agentRunId = row.agent_run_id;
  if (row.author_type != null) out.authorType = row.author_type;
  if (row.content_hash != null) out.contentHash = row.content_hash;
  if (row.submitted_at != null) out.submittedAt = row.submitted_at;
  if (row.joined_at != null) out.joinedAt = row.joined_at;
  if (row.consented_at != null) out.consentedAt = row.consented_at;
  if (row.ordinal != null && out.order === undefined) out.order = row.ordinal;
  return out;
}

/**
 * Backend data client (lib/client/data.ts)
 *
 * Functionality:
 * - Typed browser client for the signed BFF (`/api/data/*`), which forwards to `/v1/data/*`.
 * - Unwraps the backend `{ ok, data }` envelope and throws `BackendApiError` on failure.
 * - Exposes research-core CRUD used by the React Query hooks in `lib/client/hooks/*`.
 *
 * Notes:
 * - Same-origin fetch carries the Auth.js session cookie; the BFF signs the identity.
 * - camelCase in/out to match the backend `to_camel` alias generator.
 *
 * @author mrpi
 * @date 2026-09-27
 */

import type {
  BibItemMetadata,
  ExperimentParams,
  LocalAttachment,
  LocalBibItem,
  LocalExperiment,
  LocalManuscript,
  LocalManuscriptBlock,
  LocalManuscriptVersion,
  LocalProject,
  LocalRagChunk,
  LocalRebuttalItem,
  LocalReviewRound,
  LocalSubmission,
  LocalTask,
  ProjectMetadata,
  RebuttalEvidence,
} from "@/lib/types/domain";

const BASE = "/api/data";

/** Error thrown when the backend returns a non-2xx or `{ ok: false }` envelope. */
export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

type Envelope<T> = { ok?: boolean; data?: T; error?: string };

/** Build a `?a=1&b=2` query string, skipping empty values. */
function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}

/** Same-origin request that unwraps the backend success envelope. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  headers.set("accept", "application/json");

  const response = await fetch(`${BASE}${path}`, { cache: "no-store", ...init, headers });
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok || !payload?.ok) {
    throw new BackendApiError(
      payload?.error ?? `HTTP_${response.status}`,
      response.status,
      payload?.error
    );
  }
  return payload.data as T;
}

// ── Projects ──────────────────────────────────────────────────────────────

/** List the caller's projects, newest first. */
export function listProjects(): Promise<LocalProject[]> {
  return request<LocalProject[]>("/projects");
}

/** Read one project by id. */
export function getProject(id: string): Promise<LocalProject> {
  return request<LocalProject>(`/projects/${id}`);
}

/** Create a project and return the created row. */
export function createProject(input: {
  name: string;
  discipline?: string;
  goal?: string;
  metadata?: ProjectMetadata;
}): Promise<LocalProject> {
  return request<LocalProject>("/projects", { method: "POST", body: JSON.stringify(input) });
}

/** Patch a project; supports soft-delete via `status: "archived"`. */
export function patchProject(id: string, patch: Partial<LocalProject>): Promise<LocalProject> {
  return request<LocalProject>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Hard-delete a project (cascades to children in Postgres). */
export function removeProject(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/projects/${id}`, { method: "DELETE" });
}

// ── Manuscripts ───────────────────────────────────────────────────────────

/** List a project's manuscripts, newest first. */
export function listManuscripts(projectId: string): Promise<LocalManuscript[]> {
  return request<LocalManuscript[]>(`/manuscripts${qs({ projectId })}`);
}

/** Create a manuscript and return the created row. */
export function createManuscript(input: {
  projectId: string;
  title: string;
  abstract?: string;
  targetJournal?: string;
}): Promise<LocalManuscript> {
  return request<LocalManuscript>("/manuscripts", { method: "POST", body: JSON.stringify(input) });
}

/** Patch a manuscript by id. */
export function patchManuscript(id: string, patch: Partial<LocalManuscript>): Promise<LocalManuscript> {
  return request<LocalManuscript>(`/manuscripts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete a manuscript by id. */
export function removeManuscript(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/manuscripts/${id}`, { method: "DELETE" });
}

// ── Manuscript blocks ─────────────────────────────────────────────────────

/** List a manuscript's blocks ordered by ordinal. */
export function listBlocks(manuscriptId: string): Promise<LocalManuscriptBlock[]> {
  return request<LocalManuscriptBlock[]>(`/manuscript-blocks${qs({ manuscriptId })}`);
}

/** Create a block (backend also writes its version-1 snapshot). */
export function createBlock(input: {
  manuscriptId: string;
  section: string;
  order: number;
  content: string;
  authorType?: string;
  agentRunId?: string;
}): Promise<LocalManuscriptBlock> {
  return request<LocalManuscriptBlock>("/manuscript-blocks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Patch a block (content changes create a new version snapshot server-side). */
export function patchBlock(
  id: string,
  patch: Partial<Pick<LocalManuscriptBlock, "section" | "order" | "content" | "version" | "authorType">>
): Promise<LocalManuscriptBlock> {
  return request<LocalManuscriptBlock>(`/manuscript-blocks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Delete a block by id. */
export function removeBlock(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/manuscript-blocks/${id}`, { method: "DELETE" });
}

/** Persist a new block ordering. */
export function reorderBlocks(manuscriptId: string, orderedIds: string[]): Promise<{ count: number }> {
  return request<{ count: number }>("/manuscript-blocks/reorder", {
    method: "POST",
    body: JSON.stringify({ manuscriptId, orderedIds }),
  });
}

/** Restore a block to a saved version. */
export function rollbackBlock(blockId: string, versionId: string): Promise<LocalManuscriptBlock> {
  return request<LocalManuscriptBlock>(`/manuscript-blocks/${blockId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ versionId }),
  });
}

// ── Manuscript versions ───────────────────────────────────────────────────

/** List versions for a manuscript or a block, newest first. */
export function listVersions(params: {
  manuscriptId?: string;
  blockId?: string;
}): Promise<LocalManuscriptVersion[]> {
  if (!params.manuscriptId && !params.blockId) return Promise.resolve([]);
  return request<LocalManuscriptVersion[]>(
    `/manuscript-versions${qs({ manuscriptId: params.manuscriptId, blockId: params.blockId })}`
  );
}

// ── Bibliography items ────────────────────────────────────────────────────

/** List a project's bibliography items, newest first. */
export function listBibItems(projectId: string): Promise<LocalBibItem[]> {
  return request<LocalBibItem[]>(`/bib-items${qs({ projectId })}`);
}

/** Create one bibliography item and return the created row. */
export function createBibItem(input: {
  projectId: string;
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  doi?: string;
  keywords?: string[];
  citationCount?: number;
  metadata?: BibItemMetadata;
}): Promise<LocalBibItem> {
  return request<LocalBibItem>("/bib-items", { method: "POST", body: JSON.stringify(input) });
}

/** Bulk-create bibliography items and return the created rows. */
export function bulkCreateBibItems(
  items: Array<{
    projectId: string;
    title: string;
    authors?: string[];
    year?: number;
    venue?: string;
    abstract?: string;
    doi?: string;
    keywords?: string[];
    citationCount?: number;
    metadata?: BibItemMetadata;
  }>
): Promise<LocalBibItem[]> {
  return request<LocalBibItem[]>("/bib-items/bulk", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

/** Patch a bibliography item by id. */
export function patchBibItem(id: string, patch: Partial<LocalBibItem>): Promise<LocalBibItem> {
  return request<LocalBibItem>(`/bib-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete a bibliography item by id. */
export function removeBibItem(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/bib-items/${id}`, { method: "DELETE" });
}

// ── RAG chunks ────────────────────────────────────────────────────────────

/** List a bibliography item's RAG chunks, ordered by chunk index. */
export function listRagChunks(bibItemId: string): Promise<LocalRagChunk[]> {
  return request<LocalRagChunk[]>(`/rag-chunks${qs({ bibItemId })}`);
}

/** Delete a RAG chunk by id. */
export function removeRagChunk(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/rag-chunks/${id}`, { method: "DELETE" });
}

// ── Attachments ───────────────────────────────────────────────────────────

/** List a project's attachment metadata, newest first. */
export function listAttachments(projectId: string): Promise<LocalAttachment[]> {
  return request<LocalAttachment[]>(`/attachments${qs({ projectId })}`);
}

/** Upload an attachment blob via multipart and return its metadata row. */
export function createAttachment(input: {
  projectId: string;
  bibItemId?: string;
  filename: string;
  data: Blob;
  mimeType?: string;
}): Promise<LocalAttachment> {
  const form = new FormData();
  form.set("projectId", input.projectId);
  if (input.bibItemId) form.set("bibItemId", input.bibItemId);
  form.set("file", input.data, input.filename);
  return request<LocalAttachment>("/attachments", { method: "POST", body: form });
}

/** Patch attachment metadata by id. */
export function patchAttachment(
  id: string,
  patch: Partial<Pick<LocalAttachment, "filename" | "bibItemId">>
): Promise<LocalAttachment> {
  return request<LocalAttachment>(`/attachments/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete an attachment (removes its blob server-side). */
export function removeAttachment(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/attachments/${id}`, { method: "DELETE" });
}

/** Same-origin download URL for an attachment blob. */
export function attachmentDownloadUrl(id: string): string {
  return `${BASE}/attachments/${id}/download`;
}

// ── Experiments ───────────────────────────────────────────────────────────

/** List a project's experiments, newest first. */
export function listExperiments(projectId: string): Promise<LocalExperiment[]> {
  return request<LocalExperiment[]>(`/experiments${qs({ projectId })}`);
}

/** Create an experiment and return the created row. */
export function createExperiment(input: {
  projectId: string;
  name: string;
  dataset?: string;
  params?: ExperimentParams;
}): Promise<LocalExperiment> {
  return request<LocalExperiment>("/experiments", { method: "POST", body: JSON.stringify(input) });
}

/** Patch an experiment by id. */
export function patchExperiment(id: string, patch: Partial<LocalExperiment>): Promise<LocalExperiment> {
  return request<LocalExperiment>(`/experiments/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete an experiment by id. */
export function removeExperiment(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/experiments/${id}`, { method: "DELETE" });
}

// ── Submissions ───────────────────────────────────────────────────────────

/** List a project's submissions ordered by journal name. */
export function listSubmissions(projectId: string): Promise<LocalSubmission[]> {
  return request<LocalSubmission[]>(`/submissions${qs({ projectId })}`);
}

/** Create a submission and return the created row. */
export function createSubmission(input: {
  projectId: string;
  manuscriptId: string;
  journalName: string;
  coverLetter?: string;
}): Promise<LocalSubmission> {
  return request<LocalSubmission>("/submissions", { method: "POST", body: JSON.stringify(input) });
}

/** Patch a submission by id. */
export function patchSubmission(id: string, patch: Partial<LocalSubmission>): Promise<LocalSubmission> {
  return request<LocalSubmission>(`/submissions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete a submission by id. */
export function removeSubmission(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/submissions/${id}`, { method: "DELETE" });
}

// ── Review rounds ─────────────────────────────────────────────────────────

/** List a submission's review rounds ordered by round number. */
export function listReviewRounds(submissionId: string): Promise<LocalReviewRound[]> {
  return request<LocalReviewRound[]>(`/review-rounds${qs({ submissionId })}`);
}

/** Create a review round and return the created row. */
export function createReviewRound(input: {
  submissionId: string;
  roundNumber: number;
  decision?: string;
  reviewText?: string;
}): Promise<LocalReviewRound> {
  return request<LocalReviewRound>("/review-rounds", { method: "POST", body: JSON.stringify(input) });
}

/** Patch a review round by id. */
export function patchReviewRound(id: string, patch: Partial<LocalReviewRound>): Promise<LocalReviewRound> {
  return request<LocalReviewRound>(`/review-rounds/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete a review round by id. */
export function removeReviewRound(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/review-rounds/${id}`, { method: "DELETE" });
}

// ── Rebuttal items ────────────────────────────────────────────────────────

/** List a review round's rebuttal items. */
export function listRebuttalItems(reviewRoundId: string): Promise<LocalRebuttalItem[]> {
  return request<LocalRebuttalItem[]>(`/rebuttal-items${qs({ reviewRoundId })}`);
}

/** Create a rebuttal item and return the created row. */
export function createRebuttalItem(input: {
  reviewRoundId: string;
  reviewerComment: string;
  response?: string;
  changeLocation?: string;
  evidence?: RebuttalEvidence;
}): Promise<LocalRebuttalItem> {
  return request<LocalRebuttalItem>("/rebuttal-items", { method: "POST", body: JSON.stringify(input) });
}

/** Patch a rebuttal item by id. */
export function patchRebuttalItem(
  id: string,
  patch: Partial<LocalRebuttalItem>
): Promise<LocalRebuttalItem> {
  return request<LocalRebuttalItem>(`/rebuttal-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete a rebuttal item by id. */
export function removeRebuttalItem(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/rebuttal-items/${id}`, { method: "DELETE" });
}

// ── Tasks ─────────────────────────────────────────────────────────────────

/** List a project's tasks ordered by title. */
export function listTasks(projectId: string): Promise<LocalTask[]> {
  return request<LocalTask[]>(`/tasks${qs({ projectId })}`);
}

/** Create a task and return the created row. */
export function createTask(input: {
  projectId: string;
  title: string;
  description?: string;
}): Promise<LocalTask> {
  return request<LocalTask>("/tasks", {
    method: "POST",
    body: JSON.stringify({ ...input, status: "pending", createdBy: "human" }),
  });
}

/** Patch a task by id. */
export function patchTask(id: string, patch: Partial<LocalTask>): Promise<LocalTask> {
  return request<LocalTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Delete a task by id. */
export function removeTask(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/tasks/${id}`, { method: "DELETE" });
}

/**
 * Training client (lib/client/training.ts)
 *
 * Typed camelCase client for the training BFF (`/api/training/*` -> `/v1/training/*`).
 * Same-origin fetch carries the Auth.js session; the BFF signs the identity.
 *
 * @author mrpi
 * @date 2026-09-30
 */

import { qs, request, requestEnvelope, requestRaw } from "@/lib/client/http";

const BASE = "/api/training";

// ── Types ─────────────────────────────────────────────────────────────────

export interface TrainingEnrollment {
  id: string;
  programId: string;
  learnerId: string;
  status: string;
  role: string;
  lastNudgedAt?: string | null;
  joinedAt?: string | null;
  email?: string | null;
  displayName?: string | null;
  program?: TrainingProgram | null;
}

export interface TrainingProgram {
  id: string;
  name: string;
  description?: string | null;
  discipline?: string | null;
  ownerId: string;
  cohortName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  maxMembers?: number | null;
  status: string;
  organizationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  enrollments?: TrainingEnrollment[];
}

export interface TrainingReview {
  id: string;
  submissionId: string;
  reviewerId: string;
  decision: string;
  feedback?: string | null;
  score?: number | null;
  createdAt: string;
}

export interface TrainingSubmission {
  id: string;
  programId: string;
  taskId: string;
  learnerId: string;
  answers?: Record<string, unknown>;
  reflection?: string | null;
  status: string;
  peerStatus?: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  updatedAt?: string;
  reviews?: TrainingReview[];
  latestReview?: TrainingReview | null;
  evidenceCards?: unknown[];
}

export interface ProgramTask {
  id: string;
  programId: string;
  taskId: string;
  ordinal: number;
  dueAt?: string | null;
  required: boolean;
  requiresReviewOverride?: boolean | null;
}

export interface CurriculumTask {
  taskId: string;
  ordinal: number;
  dueAt?: string | null;
  required: boolean;
  requiresReviewOverride?: boolean | null;
  title: string;
  description: string;
  agent: string;
  dimension: string;
  steps: string[];
  requiresReview: boolean;
}

export interface ProgramTasks {
  configured: boolean;
  rows: ProgramTask[];
  catalogSize: number;
  available: boolean;
  curriculum: CurriculumTask[];
}

export interface ClassMember {
  learnerId: string;
  displayName?: string | null;
  status: string;
  tasks: Array<{ taskId: string; status: string; overdue?: boolean; title?: string; score?: number | null }>;
  completionRate: number;
  requiredTotal: number;
  requiredDone: number;
}

export interface ProgramProgress {
  scope: "self" | "class";
  access?: "staff" | "ta";
  tasks?: unknown[];
  curriculum?: CurriculumTask[];
  members?: ClassMember[];
  completionRate?: number;
}

export interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

export interface TaskPackSummary {
  id: string;
  packKey: string;
  name: string;
  description?: string | null;
  version: string;
  source: string;
}

export interface ConsentRow {
  id: string;
  userId: string;
  displayName?: string | null;
  trainingTaskId?: string | null;
  purpose: string;
  redactionConfirmed: boolean;
  sensitiveScan?: { total?: number; byCategory?: Record<string, number> };
  consentedAt: string;
}

// ── Learner (`/me`) ────────────────────────────────────────────────────────

export async function getMyTraining(include: "enrollments" | "submissions" | "all" = "all") {
  const payload = await requestEnvelope<{ data: TrainingEnrollment[]; submissions?: TrainingSubmission[] }>(
    `${BASE}/me${qs({ include })}`
  );
  return { enrollments: payload.data ?? [], submissions: payload.submissions ?? [] };
}

export function submitTraining(body: {
  programId: string;
  taskId: string;
  answers?: Record<string, unknown>;
  reflection?: string | null;
  status?: string;
  consentProof?: { consentId: string; consentedAt: string };
}) {
  return request<TrainingSubmission>(`${BASE}/me`, { method: "POST", body: JSON.stringify(body) });
}

export function selfCertificate(programId: string) {
  return requestEnvelope<{ data: unknown; alreadyIssued?: boolean }>(`${BASE}/me/certificate`, {
    method: "POST",
    body: JSON.stringify({ programId }),
  });
}

// ── Programs / enrollments ─────────────────────────────────────────────────

export function listPrograms() {
  return requestEnvelope<{ data: TrainingProgram[]; access: string; scope: string }>(`${BASE}/programs`);
}

export function getProgram(programId: string) {
  return requestEnvelope<{ data: TrainingProgram; access: string }>(`${BASE}/programs/${programId}`);
}

export function createProgram(body: Partial<TrainingProgram>) {
  return request<TrainingProgram>(`${BASE}/programs`, { method: "POST", body: JSON.stringify(body) });
}

export function updateProgram(programId: string, body: Partial<TrainingProgram>) {
  return request<TrainingProgram>(`${BASE}/programs/${programId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function createEnrollment(programId: string, body: { learnerId: string; role?: string }) {
  return request<TrainingEnrollment>(`${BASE}/programs/${programId}/enrollments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateEnrollment(programId: string, enrollmentId: string, body: { role?: string; status?: string }) {
  return request<TrainingEnrollment>(`${BASE}/programs/${programId}/enrollments/${enrollmentId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function removeEnrollment(programId: string, enrollmentId: string) {
  return request<TrainingEnrollment>(`${BASE}/programs/${programId}/enrollments/${enrollmentId}`, {
    method: "DELETE",
  });
}

export function listOrganizations() {
  return request<OrgOption[]>(`${BASE}/organizations`);
}

export function createOrganization(body: { name: string; slug: string }) {
  return request<OrgOption>(`${BASE}/organizations`, { method: "POST", body: JSON.stringify(body) });
}

// ── Tasks / progress / report / nudge ──────────────────────────────────────

export function getProgramTasks(programId: string) {
  return request<ProgramTasks>(`${BASE}/programs/${programId}/tasks`);
}

export function replaceProgramTasks(
  programId: string,
  tasks: Array<{ taskId: string; ordinal: number; dueAt?: string | null; required: boolean; requiresReviewOverride?: boolean | null }>
) {
  return request<ProgramTask[]>(`${BASE}/programs/${programId}/tasks`, {
    method: "PUT",
    body: JSON.stringify({ tasks }),
  });
}

export function getProgramProgress(programId: string, learnerId?: string) {
  return request<ProgramProgress>(`${BASE}/programs/${programId}/progress${qs({ learnerId })}`);
}

export function getReport(programId: string) {
  return request<Record<string, unknown>>(`${BASE}/programs/${programId}/report`);
}

export function nudge(programId: string, body: { learnerIds?: string[]; allActive?: boolean }) {
  return request<unknown[]>(`${BASE}/programs/${programId}/nudge`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listCertificates(programId: string) {
  return request<unknown[]>(`${BASE}/programs/${programId}/certificates`);
}

export function issueCertificates(programId: string, learnerIds?: string[]) {
  return request<{ issued: unknown[]; skipped: unknown[] }>(`${BASE}/programs/${programId}/certificates`, {
    method: "POST",
    body: JSON.stringify({ learnerIds }),
  });
}

export function verifyCertificate(hash: string) {
  return requestEnvelope<{ valid: boolean; data?: Record<string, unknown> }>(
    `${BASE}/certificates/verify${qs({ hash })}`
  );
}

// ── Export / LMS ───────────────────────────────────────────────────────────

export function exportProgram(programId: string, params: { scope: string; format: "json" | "csv"; redact?: boolean }) {
  const query = qs({ scope: params.scope, format: params.format, redact: params.redact });
  return params.format === "csv"
    ? requestRaw(`${BASE}/programs/${programId}/export${query}`)
    : request<Record<string, unknown>>(`${BASE}/programs/${programId}/export${query}`);
}

export function getLmsLink(programId: string) {
  return request<Record<string, unknown> | null>(`${BASE}/programs/${programId}/lms/link`);
}

export function upsertLmsLink(programId: string, body: Record<string, unknown>) {
  return request<Record<string, unknown>>(`${BASE}/programs/${programId}/lms/link`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteLmsLink(programId: string) {
  return request<unknown>(`${BASE}/programs/${programId}/lms/link`, { method: "DELETE" });
}

export function getGradebook(
  programId: string,
  params: { format?: string; as?: string; email?: boolean } = {}
) {
  return requestRaw(`${BASE}/programs/${programId}/lms/gradebook${qs(params)}`);
}

export function pushGrades(programId: string, body: { dryRun?: boolean; userIdMap?: Record<string, string> }) {
  return request<Record<string, unknown>>(`${BASE}/programs/${programId}/lms/push`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Reviews / peer / consents / analytics / calendar / task-packs ──────────

export function listReviews(params: Record<string, string | number | boolean | undefined>) {
  return requestEnvelope<{ data: TrainingSubmission[]; page: number; pageSize: number; total: number; access: string }>(
    `${BASE}/reviews${qs(params)}`
  );
}

export function submitReview(body: { submissionId: string; claim?: boolean; decision?: string; feedback?: string; score?: number }) {
  return request<TrainingSubmission | TrainingReview>(`${BASE}/reviews`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listPeer() {
  return request<unknown[]>(`${BASE}/peer`);
}

export function submitPeer(body: { assignmentId: string; decision: string; feedback?: string; score?: number; evidenceCardIds?: string[] }) {
  return request<unknown>(`${BASE}/peer`, { method: "POST", body: JSON.stringify(body) });
}

export function createEvidence(
  submissionId: string,
  body: { claim: string; sourceExcerpt?: string; sourceUrl?: string; verificationStatus?: string }
) {
  return request<Record<string, unknown>>(`${BASE}/submissions/${submissionId}/evidence`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateEvidence(
  evidenceId: string,
  body: { claim?: string; sourceExcerpt?: string; verificationStatus?: string; evidenceStrength?: string; userNote?: string }
) {
  return request<Record<string, unknown>>(`${BASE}/evidence/${evidenceId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listConsents(programId: string, params: { purpose?: string; page?: number; pageSize?: number } = {}) {
  return request<{ consents: ConsentRow[]; stats: Record<string, number>; masked: boolean; page: number; pageSize: number; total: number }>(
    `${BASE}/programs/${programId}/consents${qs(params)}`
  );
}

export function getAnalytics(params: Record<string, string | undefined> = {}) {
  return request<Record<string, unknown>>(`${BASE}/analytics/dashboard${qs(params)}`);
}

export function getCalendar(params: { year?: number; month?: number } = {}) {
  return request<{ year: number; month: number; days: unknown[]; events: unknown[]; access: string }>(
    `${BASE}/calendar${qs(params)}`
  );
}

export function listTaskPacks() {
  return request<{ builtin: TaskPackSummary[]; packs: TaskPackSummary[] }>(`${BASE}/task-packs`);
}

export function upsertTaskPack(
  pack: {
    key: string;
    name: string;
    version?: string;
    description?: string;
    organizationId?: string;
    tasks: Array<Record<string, unknown>>;
  }
) {
  return request<TaskPackSummary>(`${BASE}/task-packs`, {
    method: "POST",
    body: JSON.stringify({
      packKey: pack.key,
      name: pack.name,
      description: pack.description ?? null,
      version: pack.version ?? "1.0.0",
      source: "upload",
      organizationId: pack.organizationId,
      definitions: pack.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description ?? "",
        agent: task.agent,
        dimension: task.dimension,
        steps: task.steps ?? [],
        requiresReview: task.requiresReview ?? false,
        peerReview: task.peerReview ?? false,
      })),
    }),
  });
}

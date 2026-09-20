/**
 * Peer review assignment helpers (pure, deterministic).
 *
 * Functionality:
 * - Picks a deterministic peer reviewer (`pickPeerReviewer`) from eligible candidates.
 * - Provides a stable FNV-1a index hash and reviewer anonymization tokens.
 * - Types the anonymized peer review queue item payload.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** A learner eligible to be assigned as a peer reviewer. */
export type PeerCandidate = {
  learnerId: string;
  status: string;
};

/**
 * Pick one peer reviewer for a submission.
 * - Never self
 * - Prefer active enrollments
 * - Deterministic: hash(submissionId) % candidates
 */
export function pickPeerReviewer(params: {
  submissionId: string;
  authorLearnerId: string;
  candidates: PeerCandidate[];
}): string | null {
  const pool = params.candidates
    .filter((c) => c.learnerId !== params.authorLearnerId)
    .filter((c) => c.status === "active" || c.status === "completed")
    .map((c) => c.learnerId)
    .sort();
  if (pool.length === 0) return null;
  const index = stableIndex(params.submissionId, pool.length);
  return pool[index] ?? null;
}

/** Simple FNV-1a style hash for deterministic index. */
export function stableIndex(seed: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % modulo;
}

/** Anonymize learner id for peer UI (short token, not reversible in UI). */
export function anonymizeLearnerToken(learnerId: string, salt = "peer"): string {
  let h = 0;
  const s = `${salt}:${learnerId}`;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `P-${hex.slice(0, 6).toUpperCase()}`;
}

/** One anonymized peer review assignment shown in the reviewer queue. */
export type PeerQueueItem = {
  assignmentId: string;
  submissionId: string;
  programId: string;
  taskId: string;
  taskTitle?: string;
  /** Anonymized author label */
  authorToken: string;
  answers: Record<string, string>;
  reflection?: string | null;
  evidenceCards?: Array<{
    id: string;
    claim?: string;
    sourceExcerpt?: string;
    verificationStatus?: string;
  }>;
  assignedAt: string;
  dueAt?: string | null;
  status: string;
};

/** True when a task's peer-review flag is explicitly enabled. */
export function taskRequiresPeerReview(params: {
  peerReviewFlag?: boolean | null;
}): boolean {
  return params.peerReviewFlag === true;
}

/**
 * Training completion certificate — pure helpers (hash + eligibility).
 *
 * Functionality:
 * - Assesses required-task completion (`assessCompletion`) into an eligibility result.
 * - Builds a canonical `CertificatePayloadV1` plus its stable JSON serialization.
 * - Hashes / verifies payloads with SHA-256 via WebCrypto or a Node `crypto` fallback.
 *
 * Notes:
 * - Pure functions; hashing is async and browser/Node portable.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Versioned certificate payload that gets hashed and verified. */
export type CertificatePayloadV1 = {
  v: 1;
  programId: string;
  programName: string;
  learnerId: string;
  displayName: string | null;
  completedTaskIds: string[];
  requiredTaskIds: string[];
  completedAt: string;
  issuer: string;
};

/** Eligibility breakdown for certificate issuance. */
export type CompletionEligibility = {
  eligible: boolean;
  missingRequired: string[];
  completedRequired: string[];
  requiredTaskIds: string[];
};

/** Compare required task ids against task statuses to decide certificate eligibility. */
export function assessCompletion(params: {
  requiredTaskIds: string[];
  taskStatus: Record<string, string>;
  doneStatuses?: string[];
}): CompletionEligibility {
  const done = new Set(params.doneStatuses ?? ["approved", "completed"]);
  const completedRequired: string[] = [];
  const missingRequired: string[] = [];
  for (const taskId of params.requiredTaskIds) {
    const status = params.taskStatus[taskId] ?? "not_started";
    if (done.has(status)) completedRequired.push(taskId);
    else missingRequired.push(taskId);
  }
  return {
    eligible: missingRequired.length === 0 && params.requiredTaskIds.length > 0,
    missingRequired,
    completedRequired,
    requiredTaskIds: params.requiredTaskIds,
  };
}

/** Assemble a canonical payload with sorted task ids and default timestamp/issuer. */
export function buildCertificatePayload(params: {
  programId: string;
  programName: string;
  learnerId: string;
  displayName?: string | null;
  completedTaskIds: string[];
  requiredTaskIds: string[];
  completedAt?: string;
  issuer?: string;
}): CertificatePayloadV1 {
  return {
    v: 1,
    programId: params.programId,
    programName: params.programName,
    learnerId: params.learnerId,
    displayName: params.displayName ?? null,
    completedTaskIds: [...params.completedTaskIds].sort(),
    requiredTaskIds: [...params.requiredTaskIds].sort(),
    completedAt: params.completedAt ?? new Date().toISOString(),
    issuer: params.issuer ?? "iScholar",
  };
}

/** Serialize a payload with a fixed key order for stable hashing. */
export function canonicalCertificateJson(payload: CertificatePayloadV1): string {
  return JSON.stringify({
    v: payload.v,
    programId: payload.programId,
    programName: payload.programName,
    learnerId: payload.learnerId,
    displayName: payload.displayName,
    completedTaskIds: payload.completedTaskIds,
    requiredTaskIds: payload.requiredTaskIds,
    completedAt: payload.completedAt,
    issuer: payload.issuer,
  });
}

/** SHA-256 hex digest of the canonical payload JSON. */
export async function hashCertificatePayload(
  payload: CertificatePayloadV1
): Promise<string> {
  const text = canonicalCertificateJson(payload);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text).digest("hex");
}

/** Recompute the payload hash and compare it (case-insensitively) to the expected value. */
export async function verifyCertificateHash(
  payload: CertificatePayloadV1,
  expectedHash: string
): Promise<boolean> {
  const actual = await hashCertificatePayload(payload);
  return actual === expectedHash.toLowerCase();
}

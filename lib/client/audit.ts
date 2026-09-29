/**
 * Audit + consent client (lib/client/audit.ts)
 *
 * - Typed browser client for `/api/audit/*` (hash-chained audit ledger + consents).
 * - Sends camelCase bodies matching the backend `CamelModel` aliases.
 */

import type { AiConsentPurpose, LocalAiConsent, LocalAuditEntry } from "@/lib/types/domain";
import { qs, request } from "@/lib/client/http";

const BASE = "/api/audit";

/** Append a hash-chained audit entry to a project's ledger. */
export async function appendAudit(input: {
  projectId: string;
  action: string;
  actor?: string;
  agentRunId?: string;
  promptHash?: string;
  inputHash?: string;
  outputHash?: string;
  consentId?: string;
}): Promise<LocalAuditEntry> {
  return request<LocalAuditEntry>(BASE, { method: "POST", body: JSON.stringify(input) });
}

/** List a project's audit chain in chronological order. */
export async function listAudit(projectId: string): Promise<LocalAuditEntry[]> {
  return request<LocalAuditEntry[]>(`${BASE}/${projectId}`);
}

/** Verify the integrity of a project's audit chain. */
export async function verifyAudit(
  projectId: string
): Promise<{ valid: boolean; brokenAt: string | null; totalEntries: number }> {
  return request(`${BASE}/${projectId}/verify`);
}

/** Record an external-AI consent proof in Postgres (project optional for camp consents). */
export async function createConsent(input: {
  projectId?: string;
  programId?: string;
  trainingTaskId?: string;
  purpose?: AiConsentPurpose;
  dataCategories?: string[];
  externalServices: string[];
  redactionConfirmed: boolean;
  sensitiveScan?: { total: number; byCategory: Record<string, number> };
}): Promise<LocalAiConsent> {
  return request<LocalAiConsent>(`${BASE}/consents`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** List the caller's recent consents for a project, newest first. */
export async function listConsents(projectId: string, purpose?: AiConsentPurpose): Promise<LocalAiConsent[]> {
  return request<LocalAiConsent[]>(`${BASE}/consents${qs({ projectId, purpose })}`);
}

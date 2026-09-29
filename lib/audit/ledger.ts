/**
 * Audit Ledger (lib/audit/ledger.ts)
 *
 * Functionality:
 * - Hashes prompt/input/output content for tamper-evident audit records.
 * - Writes audit entries to the backend hash-chained ledger (`/v1/audit`).
 * - Verifies the integrity of a project's hash chain.
 *
 * Notes:
 * - Uses a 16-character truncated SHA-256 digest for the content hashes.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { sha256 } from "@/lib/utils/crypto";
import { appendAudit, verifyAudit } from "@/lib/client/audit";

/**
 * Hash content using SHA-256 (crypto.subtle with pure-JS fallback).
 */
export async function hashContent(content: string): Promise<string> {
  const full = await sha256(content);
  return full.slice(0, 16);
}

/**
 * Write an audit entry to the backend hash chain.
 * The backend links `parentHash` to the previous entry's chain hash.
 */
export async function writeAuditEntry(params: {
  projectId: string;
  agentRunId?: string;
  actor?: string;
  action: string;
  promptHash?: string;
  inputHash?: string;
  outputHash?: string;
  consentId?: string;
}): Promise<void> {
  await appendAudit({
    projectId: params.projectId,
    agentRunId: params.agentRunId,
    actor: params.actor,
    action: params.action,
    promptHash: params.promptHash,
    inputHash: params.inputHash,
    outputHash: params.outputHash,
    consentId: params.consentId,
  });
}

/**
 * Verify the integrity of the audit chain for a project.
 */
export async function verifyAuditChain(projectId: string): Promise<{
  valid: boolean;
  brokenAt: string | null;
  totalEntries: number;
}> {
  return verifyAudit(projectId);
}

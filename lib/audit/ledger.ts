/**
 * Audit Ledger (lib/audit/ledger.ts)
 *
 * Functionality:
 * - Hashes prompt/input/output content for tamper-evident audit records.
 * - Writes audit entries that auto-link to the previous entry's output hash.
 * - Verifies the integrity of a project's hash chain.
 *
 * Notes:
 * - Entries live in Dexie locally or in Supabase `audit_ledger` in collaborative mode.
 * - Uses a 16-character truncated SHA-256 digest as the chain hash.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { localDB } from "@/lib/local/db";
import { nanoid } from "nanoid";
import { sha256 } from "@/lib/local/crypto-fallback";
import { getCollaborativeClient, isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteInsert } from "@/lib/supabase/remote-query";

/**
 * Hash content using SHA-256 (crypto.subtle with pure-JS fallback).
 */
export async function hashContent(content: string): Promise<string> {
  const full = await sha256(content);
  return full.slice(0, 16);
}

/**
 * Write an audit entry to local IndexedDB.
 * Automatically links to the previous entry's outputHash via parentHash.
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
  parentHash?: string;
}): Promise<void> {
  // Find the previous audit entry for this project to auto-link parentHash
  let autoParentHash = params.parentHash;

  if (!autoParentHash) {
    // Reuse the caller's parentHash, otherwise derive it from the latest entry.
    let prevEntry: { outputHash?: string } | undefined;
    if (isCollaborativeMode()) {
      const client = getCollaborativeClient();
      const { data } = client ? await client.from("audit_ledger").select("output_hash").eq("project_id", params.projectId).order("timestamp", { ascending: false }).limit(1).maybeSingle() : { data: null };
      prevEntry = data ? { outputHash: data.output_hash } : undefined;
    } else {
      const previous = await localDB.auditLedger.where("projectId").equals(params.projectId).reverse().sortBy("timestamp");
      prevEntry = previous[0];
    }
    if (prevEntry?.outputHash) {
      autoParentHash = prevEntry.outputHash;
    }
  }

  const entry = {
    id: nanoid(),
    projectId: params.projectId,
    agentRunId: params.agentRunId,
    actor: params.actor,
    action: params.action,
    promptHash: params.promptHash,
    inputHash: params.inputHash,
    outputHash: params.outputHash,
    consentId: params.consentId,
    parentHash: autoParentHash,
    timestamp: new Date().toISOString(),
  };
  if (isCollaborativeMode()) await remoteInsert("audit_ledger", entry);
  else await localDB.auditLedger.add(entry);
}

/**
 * Verify the integrity of the audit chain for a project.
 * Checks that each entry's parentHash matches the previous entry's outputHash.
 */
export async function verifyAuditChain(projectId: string): Promise<{
  valid: boolean;
  brokenAt: string | null;
  totalEntries: number;
}> {
  let entries: Array<{ id: string; parentHash?: string; outputHash?: string }>;
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    const { data, error } = client ? await client.from("audit_ledger").select("id,parent_hash,output_hash").eq("project_id", projectId).order("timestamp") : { data: null, error: new Error("COLLABORATIVE_AUTH_REQUIRED") };
    if (error) throw error;
    entries = (data ?? []).map((entry) => ({ id: entry.id, parentHash: entry.parent_hash, outputHash: entry.output_hash }));
  } else {
    entries = await localDB.auditLedger.where("projectId").equals(projectId).sortBy("timestamp");
  }

  // Walk the chain and report the first entry whose parent link is broken.
  for (let i = 1; i < entries.length; i++) {
    if (
      entries[i].parentHash &&
      entries[i].parentHash !== entries[i - 1].outputHash
    ) {
      return {
        valid: false,
        brokenAt: entries[i].id,
        totalEntries: entries.length,
      };
    }
  }

  return {
    valid: true,
    brokenAt: null,
    totalEntries: entries.length,
  };
}

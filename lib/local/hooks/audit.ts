/**
 * Audit Ledger Hooks (lib/local/hooks/audit.ts)
 *
 * Functionality:
 * - Reads audit ledger entries for a project from Dexie `auditLedger` or Supabase `audit_ledger`.
 * - Returns entries newest-first by timestamp in local mode.
 * - Delegates remote-vs-local selection to resolveListQuery.
 *
 * Notes:
 * - Collaborative Supabase reads use useRemoteRows via resolveListQuery.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalAuditEntry } from "../db";
import { useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";
import { resolveListQuery } from "./utils";

/** Lists audit ledger entries for a project, newest-first. */
export function useLocalAuditEntries(projectId: string): RemoteListQuery<LocalAuditEntry> {
  const remote = useRemoteRows<LocalAuditEntry>("audit_ledger", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.auditLedger.where("projectId").equals(projectId).reverse().sortBy("timestamp"),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/**
 * Backend audit hooks (lib/client/hooks/audit.ts)
 *
 * Functionality:
 * - React Query hook for the hash-chained audit ledger at `/api/audit/*`.
 * - Replaces the legacy Dexie audit reader now that writes go to the backend.
 *
 * @author mrpi
 * @date 2026-09-29
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/client/audit";
import { qk } from "./keys";

/** Lists a project's audit chain from the backend, newest last. */
export function useAuditEntries(projectId: string) {
  return useQuery({
    queryKey: qk.audit(projectId),
    queryFn: () => api.listAudit(projectId),
    enabled: Boolean(projectId),
  });
}

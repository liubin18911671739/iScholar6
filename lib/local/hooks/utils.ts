/**
 * Local Hook Utilities (lib/local/hooks/utils.ts)
 *
 * Functionality:
 * - Exports the shared ISO timestamp helper `now`.
 * - Provides `resolveListQuery` to prefer collaborative remote results or wrap local Dexie lists.
 * - Provides `safeList` to coerce unknown payloads into arrays for safe UI use.
 *
 * Notes:
 * - Guarantees list query `data` is always `T[] | undefined`, never a bare object.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import {
  asRowArray,
  localListQuery,
  type RemoteListQuery,
} from "@/lib/supabase/remote-query";

/** Shared utility for timestamp generation. */
const now = () => new Date().toISOString();
export { now };

// Fallback query returned when collaborative mode has no remote handle.
const emptyListQuery = <T,>(): RemoteListQuery<T> => ({
  data: undefined,
  error: null,
  refetch: () => {},
});

/**
 * Prefer collaborative remote result; otherwise wrap a local Dexie list.
 * Guarantees `data` is always `T[] | undefined` (never a bare object).
 */
export function resolveListQuery<T>(
  remote: RemoteListQuery<T> | null | undefined,
  local: T[] | undefined
): RemoteListQuery<T> {
  if (isCollaborativeMode()) {
    if (!remote) return emptyListQuery<T>();
    return {
      data: asRowArray<T>(remote.data),
      error: remote.error ?? null,
      refetch: remote.refetch ?? (() => {}),
    };
  }
  return localListQuery(asRowArray<T>(local));
}

/** Safe list for UI: never throws on `.filter` when remote payload is malformed. */
export function safeList<T>(value: unknown): T[] {
  return asRowArray<T>(value) ?? [];
}

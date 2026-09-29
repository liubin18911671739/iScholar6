/**
 * Client data-layer types (lib/client/types.ts)
 *
 * Functionality:
 * - Neutral list-query contract shared by the React Query hooks and their callers.
 * - Defensive array normalizers used when shaping backend responses.
 *
 * Notes:
 * - Previously lived in `lib/supabase/remote-query.ts`.
 *
 * @author mrpi
 * @date 2026-09-28
 */

/** Reactive list result returned by every data hook. */
export type RemoteListQuery<T> = {
  data: T[] | undefined;
  error: string | null;
  refetch: () => void;
};

/** An empty list query with no error, used before data resolves. */
export function emptyRemoteListQuery<T>(): RemoteListQuery<T> {
  return { data: undefined, error: null, refetch: () => {} };
}

/** Wrap already-available local data as a list query. */
export function localListQuery<T>(data: T[]): RemoteListQuery<T> {
  return { data, error: null, refetch: () => {} };
}

/** Coerce an unknown value to a typed row array, defaulting to `[]`. */
export function asRowArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const rows = (value as { data?: unknown }).data;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

/** Coerce an unknown value to a typed row array (explicit empty alias). */
export function asRowArrayOrEmpty<T>(value: unknown): T[] {
  return asRowArray<T>(value);
}

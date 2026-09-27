/**
 * Client data-backend switch (lib/client/config.ts)
 *
 * Functionality:
 * - Reads `NEXT_PUBLIC_DATA_BACKEND` to choose the research data layer.
 * - `legacy` (default) keeps Dexie/IndexedDB + Supabase hooks in `lib/local/hooks/*`.
 * - `backend` routes research hooks through the signed BFF (`/api/data/*`) with React Query.
 *
 * Notes:
 * - The value is inlined by Next at build time; changing it requires a rebuild.
 */

export type DataBackend = "legacy" | "backend";

/** Active research data backend, defaulting to the legacy browser-local layer. */
export const DATA_BACKEND: DataBackend =
  process.env.NEXT_PUBLIC_DATA_BACKEND === "backend" ? "backend" : "legacy";

/** Whether research hooks should talk to the Python backend via the BFF proxy. */
export function isDataBackendEnabled(): boolean {
  return DATA_BACKEND === "backend";
}

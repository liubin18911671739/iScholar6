/**
 * Shared hook helpers (lib/client/hooks/shared.ts)
 *
 * Functionality:
 * - Normalizes React Query results into the legacy `RemoteListQuery<T>` shape.
 * - Provides a stable error-message formatter and shared query client accessor.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import type { RemoteListQuery } from "@/lib/client/types";

/** Convert an unknown thrown value into a display string. */
export function errorMessage(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Build a legacy-compatible list query handle from a React Query result. */
export function toListQuery<T>(
  data: T[] | undefined,
  error: unknown,
  refetch: () => void
): RemoteListQuery<T> {
  return { data, error: error ? errorMessage(error) : null, refetch };
}

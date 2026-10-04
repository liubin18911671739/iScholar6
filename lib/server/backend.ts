/** Server-side BFF helpers for the Python platform API. */

import { createHmac } from "crypto";

/**
 * Resolve the authenticated Auth.js user id. Lazily imported so unit tests can
 * load this module without pulling next-auth (`next/server` does not resolve
 * under Vitest).
 */
async function resolveAuthenticatedUserId(): Promise<string | null> {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Returns signed backend identity headers for the current authenticated user. */
export async function backendIdentityHeaders(): Promise<Record<string, string> | null> {
  const secret = process.env.AGENT_SERVICE_TOKEN;
  if (!secret) return null;
  const userId = await resolveAuthenticatedUserId();
  if (!userId) return null;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${userId}:${timestamp}`).digest("hex");
  return {
    "X-IScholar-User": userId,
    "X-IScholar-Timestamp": timestamp,
    "X-IScholar-Signature": signature,
  };
}

/** Resolves the private service URL; browser code must never see this value. */
export function backendUrl(path: string): string {
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** A consent row as serialized by ``/v1/audit/consents``. */
export interface BackendConsent {
  id: string;
  projectId: string | null;
  programId: string | null;
  trainingTaskId: string | null;
  purpose: string;
  dataCategories: string[];
  externalServices: string[];
  redactionConfirmed: boolean;
  consentedAt: string;
}

/**
 * Fetch one consent owned by the signed caller. Returns `null` when the row is
 * missing, not owned, or the backend is unreachable — callers must fail closed.
 */
export async function fetchBackendConsent(consentId: string): Promise<BackendConsent | null> {
  const identity = await backendIdentityHeaders();
  if (!identity) return null;
  try {
    const response = await fetch(backendUrl(`/v1/audit/consents/${encodeURIComponent(consentId)}`), {
      headers: identity,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { data?: BackendConsent } | null;
    return payload?.data ?? null;
  } catch {
    return null;
  }
}

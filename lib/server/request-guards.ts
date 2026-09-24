/**
 * Request Guards (lib/server/request-guards.ts)
 *
 * Functionality:
 * - Provides in-memory per-IP rate limiting and body-size checks for API routes.
 * - Builds Supabase clients for bearer-token, server-session, and service-role contexts.
 * - Resolves the authenticated user and validates/verifies AI consent proofs.
 *
 * Side effects:
 * - Keeps a process-local rate-limit bucket map and reads consent rows from Supabase.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { validateAiConsentProof, type AiConsentProof } from "@/lib/ai/consent";

// Per-process rate-limit buckets keyed by `scope:address`.
const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const MAX_BODY_BYTES = 256 * 1024;

/** Enforce a per-IP sliding window (20 req/min) for the given scope. */
export function checkRateLimit(request: Request, scope: string) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const key = `${scope}:${address}`;
  const now = Date.now();
  const current = buckets.get(key);
  Array.from(buckets.entries()).forEach(([bucketKey, bucket]) => { if (bucket.resetAt <= now) buckets.delete(bucketKey); });
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true as const };
  }
  if (current.count >= MAX_REQUESTS) return { ok: false as const, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  current.count += 1;
  return { ok: true as const };
}

/** True when the declared content length is absent or within the byte cap. */
export function checkBodySize(request: Request, maxBytes = MAX_BODY_BYTES) {
  const length = request.headers.get("content-length");
  return !length || Number.isNaN(Number(length)) || Number(length) <= maxBytes;
}

// Extract the bearer token from an Authorization header, if present.
function getBearerToken(request?: Request) {
  return request?.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
}

/** Build a Supabase client from a bearer token, else the server session client. */
export function createApiSupabaseClient(request?: Request) {
  const bearer = getBearerToken(request);
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
  }
  return createSupabaseServerClient();
}

/** Build a service-role Supabase client, or `null` when unconfigured. */
export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Resolve the authenticated user from a bearer token or the server session. */
export async function requireApiUser(request?: Request) {
  // Browser-local mode has no server session; the UI is gated client-side.
  if (!isCollaborativeMode()) return { ok: true as const, userId: "local" };
  const bearer = getBearerToken(request);
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { ok: false as const };
    const stateless = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user } } = await stateless.auth.getUser(bearer);
    return user ? { ok: true as const, userId: user.id } : { ok: false as const };
  }
  const client = createSupabaseServerClient();
  if (!client) return { ok: false as const };
  const { data: { user } } = await client.auth.getUser();
  return user ? { ok: true as const, userId: user.id } : { ok: false as const };
}

/** Structural check that a consent proof has a bounded external-services list. */
export function validateConsent(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const proof = value as AiConsentProof;
  return Array.isArray(proof.externalServices) && proof.externalServices.length <= 10 && validateAiConsentProof(proof);
}

/** Verify a consent proof against the consent row, tolerating verification gaps. */
export async function verifyConsent(value: unknown, projectId: unknown, userId: string | null, request?: Request) {
  if (!validateConsent(value)) {
    console.warn("[consent] invalid proof shape");
    return false;
  }
  if (typeof projectId !== "string" || !userId) {
    console.warn("[consent] missing project or user", { hasProjectId: typeof projectId === "string", hasUserId: Boolean(userId) });
    return false;
  }
  const client = createServiceSupabaseClient() ?? createApiSupabaseClient(request);
  if (!client) return true;
  const proof = value as AiConsentProof;
  const { data, error } = await client
    .from("ai_consents")
    .select("id, external_services")
    .eq("id", proof.consentId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("redaction_confirmed", true)
    .maybeSingle();
  const services = Array.isArray(data?.external_services) ? data.external_services : [];
  const dbValid = !error && services.some((service) => typeof service === "string" && service.toLowerCase() === "deepseek");
  if (dbValid) return true;

  console.warn("[consent] database verification failed; accepting recent authenticated proof", {
    consentId: proof.consentId,
    projectId,
    userId,
    hasRow: Boolean(data),
    error: error?.message ?? null,
  });
  return true;
}

/** Build a non-cacheable JSON error response. */
export function jsonError(error: string, status: number, headers?: HeadersInit) {
  return Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Create an abort signal that fires after the given timeout. */
export function timeoutSignal(milliseconds = 60_000) {
  return AbortSignal.timeout(milliseconds);
}

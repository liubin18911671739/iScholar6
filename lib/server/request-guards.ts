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
import { fetchBackendConsent } from "@/lib/server/backend";

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

/** Build a service-role Supabase client, or `null` when unconfigured. */
export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * True when the explicit local-only API bypass is enabled. Never set this in
 * production; the default stack authenticates through Auth.js.
 */
function allowLocalApi(): boolean {
  // Never honor the bypass in a production build, even if the env var leaks in.
  return process.env.ALLOW_LOCAL_API === "true" && process.env.NODE_ENV !== "production";
}

/** Resolve the authenticated user from the Auth.js session, a bearer token, or the Supabase session. */
export async function requireApiUser(request?: Request) {
  // Primary path: the signed-in Auth.js session (cookies on same-origin API calls).
  // Imported lazily so unit tests can load this module without pulling next-auth.
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (session?.user?.id) return { ok: true as const, userId: session.user.id };
  } catch {
    // No Auth.js request context (e.g. tests or Edge); fall through.
  }

  // Legacy collaborative mode still authenticates through Supabase sessions/tokens.
  if (isCollaborativeMode()) {
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

  // Browser-local dev bypass must be opted into explicitly.
  if (allowLocalApi()) return { ok: true as const, userId: "local" };
  return { ok: false as const };
}

/** Structural check that a consent proof has a bounded external-services list. */
export function validateConsent(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const proof = value as AiConsentProof;
  return Array.isArray(proof.externalServices) && proof.externalServices.length <= 10 && validateAiConsentProof(proof);
}

/**
 * Verify a consent proof against the backend `ai_consents_v2` row. Fails closed:
 * an invalid shape, missing project, unreachable backend, unowned consent, or a
 * project/audit mismatch all reject the request.
 */
export async function verifyConsent(value: unknown, projectId: unknown, userId: string | null) {
  if (!validateConsent(value)) {
    console.warn("[consent] invalid proof shape");
    return false;
  }
  if (typeof projectId !== "string" || !projectId || !userId) {
    console.warn("[consent] missing project or user", { hasProjectId: typeof projectId === "string", hasUserId: Boolean(userId) });
    return false;
  }

  // Local-only dev/tests cannot reach the signed backend; the shape check above suffices.
  if (allowLocalApi()) return true;

  const proof = value as AiConsentProof;
  const consent = await fetchBackendConsent(proof.consentId);
  if (!consent) {
    console.warn("[consent] consent not found or backend unavailable", { consentId: proof.consentId });
    return false;
  }
  const services = Array.isArray(consent.externalServices) ? consent.externalServices : [];
  const matchesScope = consent.projectId === projectId;
  const valid =
    consent.redactionConfirmed &&
    matchesScope &&
    services.some((service) => typeof service === "string" && service.toLowerCase() === "deepseek");
  if (!valid) {
    console.warn("[consent] consent does not authorize this project/service", {
      consentId: proof.consentId,
      projectId,
      consentProjectId: consent.projectId,
    });
  }
  return valid;
}

/**
 * Verify a program-scoped (camp submission) consent against backend
 * `ai_consents_v2`. Fails closed like {@link verifyConsent}.
 */
export async function verifyProgramConsent(value: unknown, programId: unknown, userId: string | null) {
  if (!value || typeof value !== "object") {
    console.warn("[consent] invalid training proof shape");
    return false;
  }
  const proof = value as AiConsentProof;
  if (!proof.consentId || !proof.redactionConfirmed) {
    console.warn("[consent] incomplete training proof");
    return false;
  }
  if (typeof programId !== "string" || !programId || !userId) {
    console.warn("[consent] missing program or user");
    return false;
  }
  if (allowLocalApi()) return true;

  const consent = await fetchBackendConsent(proof.consentId);
  if (!consent) {
    console.warn("[consent] training consent not found or backend unavailable", { consentId: proof.consentId });
    return false;
  }
  return (
    consent.redactionConfirmed &&
    consent.programId === programId &&
    consent.purpose === "training_submit"
  );
}

/** Build a non-cacheable JSON error response. */
export function jsonError(error: string, status: number, headers?: HeadersInit) {
  return Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Create an abort signal that fires after the given timeout. */
export function timeoutSignal(milliseconds = 60_000) {
  return AbortSignal.timeout(milliseconds);
}

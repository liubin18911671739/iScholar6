/**
 * Signed invite tokens (lib/server/invite-token.ts)
 *
 * Functionality:
 * - Creates/verifies short-lived invite tokens bound to an email address.
 * - HMAC-SHA256 over a base64url payload using `AUTH_SECRET`; no DB table needed.
 *
 * Notes:
 * - Server-only. Returns null when `AUTH_SECRET` is unset or the token is
 *   malformed/expired/tampered.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Invite link validity window (7 days). */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string | null {
  return process.env.AUTH_SECRET ?? null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Create a signed invite token for an email, or null when unconfigured. */
export function createInviteToken(email: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(
    JSON.stringify({ email: email.trim().toLowerCase(), exp: now + TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

/** Verify an invite token and return its email, or null when invalid. */
export function verifyInviteToken(token: string, now = Date.now()): { email: string } | null {
  const key = secret();
  if (!key) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, key));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.email !== "string" || typeof parsed.exp !== "number" || parsed.exp < now) {
      return null;
    }
    return { email: parsed.email };
  } catch {
    return null;
  }
}

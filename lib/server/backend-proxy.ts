/**
 * Authenticated BFF proxy to the Python backend (lib/server/backend-proxy.ts)
 *
 * Functionality:
 * - Signs the current Auth.js identity and forwards a request to `/v1/<segments>`.
 * - Supports GET/POST/PUT/PATCH/DELETE/HEAD and multipart + SSE passthrough.
 * - Enforces a root-segment allowlist and rejects path traversal.
 *
 * Notes:
 * - Server-only. Never expose `backendUrl` / `AGENT_SERVICE_TOKEN` to the browser.
 */

import { NextRequest } from "next/server";
import { backendIdentityHeaders, backendUrl } from "@/lib/server/backend";

/** Backend API roots the web BFF is allowed to reach. */
export const ALLOWED_BACKEND_ROOTS = new Set(["agent", "data", "vectors"]);

const RESPONSE_PASSTHROUGH_HEADERS = [
  "content-type",
  "cache-control",
  "content-disposition",
  "content-length",
  "x-accel-buffering",
];

/** Reject empty segments and `.`/`..` so the proxy cannot escape its allowlist. */
function isValidPath(segments: string[]): boolean {
  if (segments.length === 0) return false;
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/** Sign and forward a request to the backend, returning its streamed response. */
export async function proxyToBackend(req: NextRequest, segments: string[]): Promise<Response> {
  if (!isValidPath(segments) || !ALLOWED_BACKEND_ROOTS.has(segments[0])) {
    return Response.json({ ok: false, error: "INVALID_BACKEND_PATH" }, { status: 400 });
  }

  const identity = await backendIdentityHeaders();
  if (!identity) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  const url = new URL(backendUrl(`/v1/${segments.join("/")}`));
  url.search = req.nextUrl?.search ?? "";

  const headers = new Headers(identity);
  const contentType = req.headers.get("content-type");
  const idempotency = req.headers.get("idempotency-key");
  const lastEventId = req.headers.get("last-event-id");
  if (contentType) headers.set("content-type", contentType);
  if (idempotency) headers.set("idempotency-key", idempotency);
  if (lastEventId) headers.set("last-event-id", lastEventId);

  const hasRequestBody = !["GET", "HEAD"].includes(req.method);
  const response = await fetch(url, {
    method: req.method,
    headers,
    body: hasRequestBody ? await req.arrayBuffer() : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  for (const name of RESPONSE_PASSTHROUGH_HEADERS) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(req.method === "HEAD" ? null : response.body, { status: response.status, headers: responseHeaders });
}

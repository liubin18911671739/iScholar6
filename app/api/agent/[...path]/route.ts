/** Authenticated thin proxy for the Python data and agent APIs. */

import { NextRequest } from "next/server";
import { backendIdentityHeaders, backendUrl } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const identity = await backendIdentityHeaders();
  if (!identity) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  const url = new URL(backendUrl(`/v1/${params.path.join("/")}`));
  url.search = req.nextUrl.search;
  const headers = new Headers(identity);
  const contentType = req.headers.get("content-type");
  const idempotency = req.headers.get("idempotency-key");
  const lastEventId = req.headers.get("last-event-id");
  if (contentType) headers.set("content-type", contentType);
  if (idempotency) headers.set("idempotency-key", idempotency);
  if (lastEventId) headers.set("last-event-id", lastEventId);
  const response = await fetch(url, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    cache: "no-store",
  });
  const responseHeaders = new Headers();
  const responseType = response.headers.get("content-type");
  if (responseType) responseHeaders.set("content-type", responseType);
  if (response.headers.get("cache-control")) responseHeaders.set("cache-control", response.headers.get("cache-control")!);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;

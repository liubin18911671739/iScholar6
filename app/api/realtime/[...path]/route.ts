/**
 * Realtime BFF proxy (/api/realtime/[...path])
 *
 * Forwards to the backend `/v1/realtime/<path>` with a signed Auth.js identity
 * and streams the SSE response body through unchanged.
 */

import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToBackend(req, ["realtime", ...params.path]);
}

export const GET = proxy;
export const HEAD = proxy;

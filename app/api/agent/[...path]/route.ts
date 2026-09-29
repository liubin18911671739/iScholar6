/**
 * Agent/data BFF proxy (/api/agent/[...path])
 *
 * Forwards to the backend `/v1/<path>` with a signed Auth.js identity. Data
 * requests may also use `/api/data/[...path]`; both share the same guard rails.
 */

import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToBackend(req, ["agent", ...params.path]);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;

/**
 * Data BFF proxy (/api/data/[...path])
 *
 * Forwards to the backend `/v1/data/<path>` with a signed Auth.js identity.
 * Client hooks (`lib/client/hooks/*`) call this for research-core data.
 */

import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToBackend(req, ["data", ...params.path]);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;

/**
 * Training BFF proxy (/api/training/[...path])
 *
 * Forwards the remaining training endpoints to the Python backend
 * (`/v1/training/<path>`) with a signed Auth.js identity. More specific
 * legacy routes still win while they are migrated.
 */

import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToBackend(req, ["training", ...params.path]);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;

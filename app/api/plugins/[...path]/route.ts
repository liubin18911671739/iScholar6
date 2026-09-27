/**
 * Plugins BFF proxy (/api/plugins/[...path])
 *
 * Forwards to the backend `/v1/plugins/<path>` with a signed Auth.js identity.
 * Per-user plugin installs and prompt-pack selections live in Postgres.
 */

import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToBackend(req, ["plugins", ...params.path]);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;

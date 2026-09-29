/**
 * Audit BFF proxy (/api/audit/[...path])
 *
 * Forwards to the backend `/v1/audit/<path>` with a signed Auth.js identity.
 * Consent + hash-chained audit records live in Postgres.
 */

import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyToBackend(req, ["audit", ...params.path]);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;

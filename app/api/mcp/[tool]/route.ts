/**
 * MCP Tool API (/api/mcp/[tool])
 *
 * Thin BFF adapter over the backend `/v1/mcp/tools` registry. GET lists tools;
 * POST reshapes the legacy flat body (`{...params, projectId, consentProof}`)
 * into the backend contract (`{projectId, consentProof:{consentId}, params}`).
 */

import { NextRequest } from "next/server";
import { backendIdentityHeaders, backendUrl } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(path: string, init: RequestInit): Promise<Response> {
  const identity = await backendIdentityHeaders();
  if (!identity) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  const response = await fetch(backendUrl(path), { ...init, headers: { ...identity, ...(init.headers ?? {}) }, cache: "no-store" });
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

/** Lists the backend MCP tools. */
export async function GET() {
  return forward("/v1/mcp/tools", { method: "GET" });
}

/** Invokes a backend MCP tool with a consent proof. */
export async function POST(req: NextRequest, { params }: { params: { tool: string } }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  const { consentProof, projectId, ...rest } = body as {
    consentProof?: { consentId?: string };
    projectId?: string;
    [key: string]: unknown;
  };
  return forward(`/v1/mcp/tools/${encodeURIComponent(params.tool)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      consentProof: { consentId: consentProof?.consentId },
      params: rest,
    }),
  });
}

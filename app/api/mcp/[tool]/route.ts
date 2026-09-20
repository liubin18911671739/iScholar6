/**
 * MCP Tool API (/api/mcp/[tool])
 *
 * Functionality:
 * - GET lists the registered MCP tools exposed by the gateway.
 * - POST authenticates the caller, applies body-size and per-tool rate limits, then invokes the named tool.
 * - Requires a valid redaction consent proof before executing a tool that may call external services.
 *
 * Notes:
 * - Tools are registered by importing `@/lib/mcp`; consent and project fields are stripped before dispatch.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import "@/lib/mcp";
import { callTool, getTool } from "@/lib/mcp/gateway";
import { checkBodySize, checkRateLimit, jsonError, requireApiUser, verifyConsent } from "@/lib/server/request-guards";

/** Lists registered MCP tools available on the gateway. */
export async function GET() {
  await import("@/lib/mcp");
  const { listTools } = await import("@/lib/mcp/gateway");
  return Response.json({ ok: true, data: listTools() });
}

/** Invokes a registered MCP tool after auth, rate-limit, and consent checks. */
export async function POST(
  req: NextRequest,
  { params }: { params: { tool: string } }
) {
  try {
    // Authenticate, then enforce request size and per-tool rate limits.
    const auth = await requireApiUser(req);
    if (!auth.ok) return jsonError("UNAUTHENTICATED", 401);
    if (!checkBodySize(req)) return jsonError("REQUEST_TOO_LARGE", 413);
    const limit = checkRateLimit(req, `mcp:${params.tool}`);
    if (!limit.ok) return jsonError("RATE_LIMITED", 429, { "Retry-After": String(limit.retryAfter) });
    // Ensure tools are registered
    await import("@/lib/mcp");

    // Resolve the requested tool or reject unknown names.
    const tool = getTool(params.tool);
    if (!tool) {
      return Response.json(
        { ok: false, error: `Unknown tool: ${params.tool}` },
        { status: 400 }
      );
    }

    // Parse tool arguments and verify the redaction consent proof.
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("INVALID_JSON", 400);
    const consentProof = body.consentProof;
    if (!(await verifyConsent(consentProof, body.projectId, auth.userId, req))) {
      return Response.json({ ok: false, error: "请先确认脱敏并允许发送到外部 AI 服务" }, { status: 403 });
    }
    // Strip consent metadata so it is not passed as tool parameters.
    const toolParams = { ...body };
    delete toolParams.consentProof;
    delete toolParams.projectId;
    // Execute the tool with the remaining parameters.
    const result = await callTool(params.tool, toolParams);

    return Response.json({ ok: true, data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error(`POST /api/mcp/${params.tool} error:`, e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

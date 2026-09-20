/**
 * Agent Proxy API (/api/agents/[agent])
 *
 * Functionality:
 * - GET returns built-in agent metadata and the allowed dynamic agent path convention.
 * - POST authenticates the caller, enforces body-size and per-agent rate limits, then streams DeepSeek output.
 * - Requires a valid AI consent proof referencing the caller's project before contacting the external service.
 *
 * Notes:
 * - Forwards upstream Server-Sent Events and appends a `__USAGE__` metadata trailer with token counts.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { AGENT_META } from "@/lib/ai/agents/registry";
import { isAgentPathAllowed } from "@/lib/plugins/ids";
import type { AiConsentProof } from "@/lib/ai/consent";
import { checkBodySize, checkRateLimit, jsonError, requireApiUser, timeoutSignal, verifyConsent } from "@/lib/server/request-guards";

/** Forces the Node.js runtime so streaming fetch is available. */
export const runtime = "nodejs";
/** Allows agent streams to run for up to five minutes. */
export const maxDuration = 300;

/** Returns built-in agent metadata and the plugin path convention. */
export async function GET() {
  return Response.json({
    ok: true,
    data: {
      builtin: AGENT_META,
      note: "plugin agents are client-registered; path allows p.<pluginId>.<key>",
    },
  });
}

/** Proxies a prompt to DeepSeek and streams the response back to the client. */
export async function POST(
  req: NextRequest,
  { params }: { params: { agent: string } }
) {
  try {
    // Authenticate, then guard request size, rate, and agent path before any work.
    const auth = await requireApiUser(req);
    if (!auth.ok) return jsonError("UNAUTHENTICATED", 401);
    if (!checkBodySize(req)) return jsonError("REQUEST_TOO_LARGE", 413);
    // Normalize the dynamic route segment and apply per-agent rate limits.
    const agentId = decodeURIComponent(params.agent);
    const limit = checkRateLimit(req, `agent:${agentId}`);
    if (!limit.ok) return jsonError("RATE_LIMITED", 429, { "Retry-After": String(limit.retryAfter) });
    // Reject unknown or disallowed agent identifiers.
    if (!isAgentPathAllowed(agentId)) {
      return Response.json(
        { ok: false, error: `Unknown agent: ${agentId}` },
        { status: 400 }
      );
    }

    // Parse and validate the JSON body and prompt size limits.
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("INVALID_JSON", 400);
    const systemPrompt = body.systemPrompt as string | undefined;
    const userPrompt = body.userPrompt as string | undefined;

    if (typeof systemPrompt !== "string" || typeof userPrompt !== "string" || !systemPrompt || !userPrompt || systemPrompt.length > 30_000 || userPrompt.length > 50_000) {
      return Response.json(
        { ok: false, error: "systemPrompt and userPrompt are required" },
        { status: 400 }
      );
    }

    // Require a valid redaction consent proof before calling the external service.
    const consentProof = body.consentProof as AiConsentProof | undefined;
    const consentValid = await verifyConsent(consentProof, body.projectId, auth.userId, req);
    if (!consentValid) {
      return Response.json(
        { ok: false, error: "请先确认脱敏并允许发送到外部 AI 服务" },
        { status: 403 }
      );
    }

    // Resolve the DeepSeek endpoint, model, and credentials from environment variables.
    const apiUrl =
      process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";
    const model =
      process.env.DEEPSEEK_MODEL ??
      process.env.NEXT_PUBLIC_DEEPSEEK_MODEL ??
      "deepseek-chat";
    if (!process.env.DEEPSEEK_API_KEY) return jsonError("AI_SERVICE_NOT_CONFIGURED", 503);

    // Use native fetch to call DeepSeek API directly (OpenAI-compatible)
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: timeoutSignal(300_000),
    });

    // Map upstream DeepSeek failures to friendlier client messages.
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DeepSeek API error (${response.status}):`, errorText);
      const message =
        response.status === 401
          ? "Invalid API key — check DEEPSEEK_API_KEY"
          : response.status === 429
            ? "Rate limited by DeepSeek — retry in a few seconds"
            : `DeepSeek API error: ${response.status}`;
      return Response.json(
        { ok: false, error: message },
        { status: response.status }
      );
    }

    // Forward the SSE stream, extracting usage from the final chunk
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          console.error("[agent] missing response body", { agent: params.agent });
          controller.close();
          return;
        }

        let usageData: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
        try {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // keep incomplete line

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                // Extract streaming content
                const content = parsed.choices?.[0]?.delta?.content
                  ?? parsed.choices?.[0]?.delta?.reasoning_content
                  ?? parsed.choices?.[0]?.message?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }

                // Extract usage data from the final chunk
                if (parsed.usage) {
                  usageData = parsed.usage;
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }

          // DeepSeek may finish without a trailing newline. Process the
          // final buffered SSE record instead of silently dropping it.
          if (buffer.trim().startsWith("data: ")) {
            const data = buffer.trim().slice(6);
            if (data !== "[DONE]") {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content
                  ?? parsed.choices?.[0]?.delta?.reasoning_content
                  ?? parsed.choices?.[0]?.message?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
                if (parsed.usage) usageData = parsed.usage;
              } catch (error) {
                console.warn("[agent] final SSE record parse failed", { agent: params.agent, error });
              }
            }
          }

          // Send usage data as a final encoded message so the client can parse it
          if (usageData) {
            const usagePayload = JSON.stringify({
              __type: "usage",
              prompt_tokens: usageData.prompt_tokens ?? 0,
              completion_tokens: usageData.completion_tokens ?? 0,
              total_tokens: usageData.total_tokens ?? 0,
            });
            // Use a special delimiter to mark this as metadata (not content)
            controller.enqueue(
              encoder.encode(`\n\n__USAGE__${usagePayload}\n\n`)
            );
          }

          controller.close();
        } catch (err) {
          console.error("[agent] stream failed", { agent: params.agent, error: err });
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error(`POST /api/agents/${params.agent} error:`, e);
    return Response.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

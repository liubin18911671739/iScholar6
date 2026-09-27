/**
 * LangGraph agent runtime bridge (lib/server/agent-runtime.ts)
 *
 * Drives the backend durable run API for a single agent request and streams the
 * resulting artifact text back to the browser, matching the legacy
 * `/api/agents/[agent]` text-stream contract (including the `__USAGE__` trailer).
 *
 * Server-only; never expose the service token to the browser.
 */

import { backendIdentityHeaders, backendUrl } from "./backend";

const POLL_INTERVAL_MS = 700;
const POLL_TIMEOUT_MS = 120_000;

function errorResponse(message: string, status: number): Response {
  return Response.json({ ok: false, error: message }, { status });
}

/** Create a backend thread + run for an agent and stream the artifact text. */
export async function runLanggraphAgent(params: {
  agentId: string;
  projectId: string;
  userPrompt: string;
  input: Record<string, unknown>;
}): Promise<Response> {
  const identity = await backendIdentityHeaders();
  if (!identity) return errorResponse("UNAUTHENTICATED", 401);
  const jsonHeaders = { ...identity, "content-type": "application/json" };

  const threadRes = await fetch(backendUrl("/v1/agent/threads"), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ projectId: params.projectId, title: `agent:${params.agentId}` }),
    cache: "no-store",
  });
  if (!threadRes.ok) return errorResponse("THREAD_CREATE_FAILED", threadRes.status);
  const threadId = (await threadRes.json()).data.id as string;

  const runRes = await fetch(backendUrl("/v1/agent/runs"), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      threadId,
      goal: params.userPrompt.slice(0, 20_000),
      agent: params.agentId,
      input: params.input,
    }),
    cache: "no-store",
  });
  if (!runRes.ok) return errorResponse("RUN_CREATE_FAILED", runRes.status);
  const runId = (await runRes.json()).data.id as string;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      try {
        while (Date.now() < deadline) {
          const detailRes = await fetch(backendUrl(`/v1/agent/runs/${runId}`), {
            headers: identity,
            cache: "no-store",
          });
          if (!detailRes.ok) {
            controller.error(new Error("RUN_LOOKUP_FAILED"));
            return;
          }
          const detail = (await detailRes.json()).data as {
            status: string;
            error?: string;
            artifacts?: Array<{ content?: { text?: string; usage?: { tokenIn?: number; tokenOut?: number } } }>;
          };
          const artifacts = detail.artifacts ?? [];
          const artifact = artifacts[artifacts.length - 1];
          const text = artifact?.content?.text;
          if (text) {
            controller.enqueue(encoder.encode(text));
            const usage = artifact?.content?.usage;
            if (usage) {
              controller.enqueue(
                encoder.encode(
                  `__USAGE__${JSON.stringify({
                    prompt_tokens: usage.tokenIn ?? 0,
                    completion_tokens: usage.tokenOut ?? 0,
                  })}\n`
                )
              );
            }
            controller.close();
            return;
          }
          if (detail.status === "failed" || detail.status === "cancelled") {
            controller.error(new Error(detail.error ?? `RUN_${detail.status.toUpperCase()}`));
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
        controller.error(new Error("AGENT_RUNTIME_TIMEOUT"));
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

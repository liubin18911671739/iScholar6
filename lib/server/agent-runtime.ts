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

/** Extract assistant text from either an artifact or the raw run result. */
function extractText(detail: {
  result?: unknown;
  artifacts?: Array<{ content?: { text?: string; usage?: { tokenIn?: number; tokenOut?: number } } }>;
}): { text: string; usage?: { tokenIn?: number; tokenOut?: number } } | null {
  const artifacts = detail.artifacts ?? [];
  const artifact = artifacts[artifacts.length - 1];
  const artifactText = artifact?.content?.text;
  if (artifactText) return { text: artifactText, usage: artifact?.content?.usage };

  // Hermes returns its reply in `result.draft` and writes no artifact.
  const draft = (detail.result as { draft?: { text?: string; usage?: { tokenIn?: number; tokenOut?: number } } } | null)?.draft;
  if (draft?.text) return { text: draft.text, usage: draft.usage };
  return null;
}

/** Create a backend thread + run for an agent and stream the artifact text. */
export async function runLanggraphAgent(params: {
  agentId: string;
  projectId: string;
  userPrompt: string;
  input: Record<string, unknown>;
  systemPrompt?: string;
  consentId?: string;
  trainingTaskId?: string;
  programId?: string;
  mode?: string;
  idempotencyKey?: string;
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

  const runHeaders: Record<string, string> = { ...jsonHeaders };
  if (params.idempotencyKey) runHeaders["idempotency-key"] = params.idempotencyKey;

  const runRes = await fetch(backendUrl("/v1/agent/runs"), {
    method: "POST",
    headers: runHeaders,
    body: JSON.stringify({
      threadId,
      goal: params.userPrompt.slice(0, 20_000) || `agent:${params.agentId}`,
      agent: params.agentId,
      input: params.input,
      systemPrompt: params.systemPrompt,
      consentId: params.consentId,
      trainingTaskId: params.trainingTaskId,
      programId: params.programId,
      mode: params.mode,
    }),
    cache: "no-store",
  });
  if (!runRes.ok) {
    const detail = (await runRes.json().catch(() => null)) as { detail?: string } | null;
    if (runRes.status === 403) {
      return errorResponse("EXTERNAL_AI_CONSENT_REQUIRED", 403);
    }
    return errorResponse(detail?.detail ?? "RUN_CREATE_FAILED", runRes.status);
  }
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
            result?: unknown;
            artifacts?: Array<{ content?: { text?: string; usage?: { tokenIn?: number; tokenOut?: number } } }>;
          };
          const extracted = extractText(detail);
          if (extracted) {
            controller.enqueue(encoder.encode(extracted.text));
            const usage = extracted.usage;
            controller.enqueue(
              encoder.encode(
                `\n\n__USAGE__${JSON.stringify({
                  prompt_tokens: usage?.tokenIn ?? 0,
                  completion_tokens: usage?.tokenOut ?? 0,
                  total_tokens: (usage?.tokenIn ?? 0) + (usage?.tokenOut ?? 0),
                })}\n\n`
              )
            );
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

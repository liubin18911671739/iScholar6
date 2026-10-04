/**
 * Agent Run Client (lib/ai/agents/index.ts)
 *
 * Functionality:
 * - Resolves prompts (plugin packs + locale directive) and dispatches a durable
 *   backend agent run through the signed BFF.
 * - Streams model text from the run's SSE `message.delta` events, polling the
 *   run for completion and the authoritative artifact text.
 * - Writes a best-effort hash-chained audit entry after completion.
 *
 * Notes:
 * - Requires prior AI consent; refuses to run without a recent consent record.
 * - Backend persistence owns run/artifact state; the client keeps no local copy.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { nanoid } from "nanoid";
import { type AgentId } from "./registry";
import { writeAuditEntry, hashContent } from "@/lib/audit/ledger";
import { useLocaleStore } from "@/lib/stores/locale-store";
import { getRecentAiConsent } from "@/lib/client/hooks/consent";
import type { LocalAiConsent } from "@/lib/types/domain";
import { resolveSystemPrompt, resolveUserPrompt } from "@/lib/plugins/prompt-resolve";
import { createRun, createThread, getRun, subscribeRunEvents, type AgentRunDetail } from "@/lib/client/agents";

const POLL_INTERVAL_MS = 700;
const POLL_TIMEOUT_MS = 120_000;

/** Parameters accepted by {@link runAgentStream}. */
export interface RunAgentStreamParams {
  agentId: AgentId;
  projectId: string;
  input: Record<string, unknown>;
  consent?: LocalAiConsent;
  /** Coach mode from training deep link. */
  mode?: "coach" | "production";
  trainingTaskId?: string;
  programId?: string;
  /** Reuse an existing thread for multi-turn conversations (coach/Hermes). */
  threadId?: string;
  onChunk: (chunk: string) => void;
  onComplete: (runId: string) => void;
  onError: (error: Error) => void;
}

/** Extract assistant text + usage from a completed run (artifact or Hermes result). */
function extractRunText(run: AgentRunDetail): {
  text: string;
  usage?: { tokenIn?: number; tokenOut?: number };
} | null {
  const artifact = run.artifacts[run.artifacts.length - 1];
  if (artifact?.content?.text) {
    return { text: artifact.content.text, usage: artifact.content.usage };
  }
  const draft = (run.result as { draft?: { text?: string; usage?: { tokenIn?: number; tokenOut?: number } } } | null)?.draft;
  if (draft?.text) return { text: draft.text, usage: draft.usage };
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Client-side agent execution against the durable backend runtime:
 * 1. Resolve prompts + language directive.
 * 2. Create a backend thread + run.
 * 3. Poll the run and stream artifact text to `onChunk`.
 * 4. Write a hash-chained audit entry (best-effort).
 */
export async function runAgentStream({
  agentId,
  projectId,
  input,
  consent: consentOverride,
  mode,
  trainingTaskId,
  programId,
  threadId,
  onChunk,
  onComplete,
  onError,
}: RunAgentStreamParams): Promise<void> {
  const consent = consentOverride ?? await getRecentAiConsent(projectId);
  if (!consent) {
    console.error("[agent-client] consent missing before request", { agentId, projectId });
    onError(new Error("请先确认脱敏并允许发送到外部 AI 服务"));
    return;
  }

  let systemPrompt: string;
  let userPrompt: string;
  try {
    systemPrompt = await resolveSystemPrompt(agentId);
    userPrompt = await resolveUserPrompt(agentId, input, projectId);
  } catch (resolveError) {
    onError(resolveError instanceof Error ? resolveError : new Error(String(resolveError)));
    return;
  }

  // Inject language directive based on user preference.
  const { agentLanguage } = useLocaleStore.getState();
  let effectiveSystemPrompt = systemPrompt;
  let effectiveUserPrompt = userPrompt;
  if (agentLanguage === "en") {
    effectiveSystemPrompt = "IMPORTANT: You MUST respond in English only. All output must be in English.\n\n" + effectiveSystemPrompt;
    effectiveUserPrompt = effectiveUserPrompt + "\n\nRespond in English only.";
  } else if (agentLanguage === "zh") {
    effectiveSystemPrompt = "重要提示：你必须使用中文回复。所有输出内容必须为中文。\n\n" + effectiveSystemPrompt;
    effectiveUserPrompt = effectiveUserPrompt + "\n\n请使用中文回复。";
  }

  let unsubscribe: () => void = () => {};
  try {
    const thread = threadId ? { id: threadId } : await createThread(projectId, `agent:${agentId}`);
    const created = await createRun(thread.id, {
      agent: agentId,
      goal: effectiveUserPrompt.slice(0, 20_000) || `agent:${agentId}`,
      input,
      systemPrompt: effectiveSystemPrompt,
      userPrompt: effectiveUserPrompt,
      consentId: consent.id,
      trainingTaskId,
      programId,
      mode,
      idempotencyKey: nanoid(),
    });
    const runId = created.id;

    // Stream incremental model text; polling below finalizes the run.
    let streamed = "";
    unsubscribe = subscribeRunEvents(runId, {
      onDelta: (text) => {
        if (!text) return;
        streamed += text;
        onChunk(text);
      },
    });

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const detail = await getRun(runId);
      const extracted = extractRunText(detail);
      if (extracted) {
        // Emit whatever has not already arrived over SSE (dedupe the prefix).
        if (!streamed) {
          onChunk(extracted.text);
        } else if (extracted.text.startsWith(streamed) && extracted.text.length > streamed.length) {
          onChunk(extracted.text.slice(streamed.length));
        }
        onComplete(runId);

        // Best-effort audit write; never fail a completed run because of it.
        try {
          const [promptHash, inputHash, outputHash] = await Promise.all([
            hashContent(effectiveSystemPrompt + effectiveUserPrompt),
            hashContent(JSON.stringify(input)),
            hashContent(extracted.text),
          ]);
          await writeAuditEntry({
            projectId,
            agentRunId: runId,
            actor: "local",
            action: `agent.${agentId}`,
            promptHash,
            inputHash,
            outputHash,
            consentId: consent.id,
          });
        } catch (auditError) {
          console.error("Agent output saved, but audit entry failed:", auditError);
        }
        return;
      }
      if (detail.status === "failed" || detail.status === "cancelled") {
        throw new Error(detail.error ?? `RUN_${detail.status.toUpperCase()}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error("AGENT_RUNTIME_TIMEOUT");
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object"
        ? JSON.stringify(error)
        : String(error);
    onError(new Error(message));
  } finally {
    unsubscribe();
  }
}

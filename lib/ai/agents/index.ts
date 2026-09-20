/**
 * Agent Run Client (lib/ai/agents/index.ts)
 *
 * Functionality:
 * - Creates local agent-run records, calls the server AI proxy, and streams the response.
 * - Injects a language directive (zh/en) into system and user prompts before dispatch.
 * - Persists outputs, token usage, cost, and latency locally or to Supabase.
 * - Best-effort parse of structured output and best-effort audit-ledger write.
 *
 * Notes:
 * - Requires prior AI consent; refuses to run without a recent consent record.
 * - Collaborators: server route /api/agents/[id], pricing, parse-agent-output, audit ledger,
 *   prompt-resolve, and the local Dexie database.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { localDB } from "@/lib/local/db";
import { type AgentId } from "./registry";
import { writeAuditEntry, hashContent } from "@/lib/audit/ledger";
import { parseAgentOutput } from "@/lib/ai/parse-agent-output";
import { calculateCostCents, type DeepSeekModel } from "@/lib/ai/pricing";
import { useLocaleStore } from "@/lib/stores/locale-store";
import { nanoid } from "nanoid";
import { getRecentAiConsent } from "@/lib/local/hooks/training";
import type { LocalAiConsent } from "@/lib/local/db";
import { getCollaborativeAuthHeaders, isCollaborativeMode, syncAgentRun, updateRemoteAgentRun } from "@/lib/supabase/collaborative";
import { resolveSystemPrompt, resolveUserPrompt } from "@/lib/plugins/prompt-resolve";

/** Model used for DeepSeek API calls — configurable via env var. */
const DEEPSEEK_MODEL: DeepSeekModel =
  (process.env.NEXT_PUBLIC_DEEPSEEK_MODEL as DeepSeekModel | undefined) ??
  "deepseek-chat";

// Persists the initial running agent-run row locally or to Supabase; sync failures are logged.
async function persistAgentRunStart(run: Parameters<typeof syncAgentRun>[0]) {
  if (isCollaborativeMode()) {
    try {
      await syncAgentRun(run);
    } catch (error) {
      console.error("[agent-client] initial agent run sync failed; continuing model call", error);
    }
    return;
  }
  await localDB.agentRuns.add(run);
}

/** Parameters accepted by {@link runAgentStream}. */
export interface RunAgentStreamParams {
  agentId: AgentId;
  projectId: string;
  input: Record<string, unknown>;
  consent?: LocalAiConsent;
  /** Coach mode from training deep link. */
  mode?: "coach" | "production";
  trainingTaskId?: string;
  onChunk: (chunk: string) => void;
  onComplete: (runId: string) => void;
  onError: (error: Error) => void;
}

/**
 * Client-side agent execution:
 * 1. Create agentRun in localDB
 * 2. POST to server proxy (DeepSeek)
 * 3. Stream response, store results in localDB
 * 4. Write audit entry
 */
export async function runAgentStream({
  agentId,
  projectId,
  input,
  consent: consentOverride,
  mode,
  trainingTaskId,
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
  const runId = nanoid();
  const startedAt = new Date().toISOString();

  // Create agent run record locally
  const initialRun = {
    id: runId,
    projectId,
    agent: agentId,
    status: "running",
    inputs: input,
    modelName: DEEPSEEK_MODEL,
    startedAt,
    ...(mode ? { mode } : {}),
    ...(trainingTaskId ? { trainingTaskId } : {}),
  } as const;
  await persistAgentRunStart(initialRun);

  let systemPrompt: string;
  let userPrompt: string;
  try {
    systemPrompt = await resolveSystemPrompt(agentId);
    userPrompt = await resolveUserPrompt(agentId, input, projectId);
  } catch (resolveError) {
    onError(resolveError instanceof Error ? resolveError : new Error(String(resolveError)));
    return;
  }

  // Inject language directive based on user preference
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

  try {
    // POST prompts plus consent proof to the server proxy; auth headers are added in collaborative mode.
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await getCollaborativeAuthHeaders()) },
      body: JSON.stringify({
        projectId,
        systemPrompt: effectiveSystemPrompt,
        userPrompt: effectiveUserPrompt,
        ...input,
        consentProof: {
          consentId: consent.id,
          consentedAt: consent.consentedAt,
          externalServices: consent.externalServices,
          redactionConfirmed: consent.redactionConfirmed,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 403) {
        throw new Error("请重新确认脱敏并允许发送到外部 AI 服务");
      }
      throw new Error(err || `Agent ${agentId} failed: ${res.status}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";
    let tokenIn = 0;
    let tokenOut = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullOutput += chunk;
        onChunk(chunk);
      }

      // Extract usage metadata from the stream (sent as __USAGE__ marker)
      const usageMatch = fullOutput.match(/__USAGE__(\{[\s\S]*?\})\n?/);
      if (usageMatch) {
        try {
          const usage = JSON.parse(usageMatch[1]);
          tokenIn = usage.prompt_tokens ?? 0;
          tokenOut = usage.completion_tokens ?? 0;
          // Strip usage payload from the displayed output
          fullOutput = fullOutput.replace(/__USAGE__\{[\s\S]*?\}\n?/g, "");
        } catch {
          // Ignore malformed usage data
        }
      }
    } else {
      console.error("[agent-client] response has no readable body", { agentId });
    }

    if (!fullOutput.trim()) {
      throw new Error(`Agent ${agentId} returned an empty response`);
    }

    const endedAt = new Date().toISOString();
    const latencyMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    const costCents = (tokenIn > 0 || tokenOut > 0)
      ? calculateCostCents(DEEPSEEK_MODEL, tokenIn, tokenOut)
      : undefined;

    // Update agent run with results
    const completedRun = {
      status: "needs_review",
      outputs: { text: fullOutput.trim() },
      tokenIn: tokenIn || undefined,
      tokenOut: tokenOut || undefined,
      costCents,
      latencyMs,
      endedAt,
    } as const;
    if (isCollaborativeMode()) {
      try {
        await updateRemoteAgentRun(runId, completedRun);
      } catch (syncError) {
        // Retry as a full upsert in case the initial insert was interrupted.
        try {
          await syncAgentRun({ ...initialRun, ...completedRun });
        } catch (retryError) {
          console.error("Model response received, but agent run sync failed:", syncError, retryError);
        }
      }
    } else await localDB.agentRuns.update(runId, completedRun);

    // Try to parse structured output and store it
    try {
      const structured = parseAgentOutput(agentId, fullOutput);
      if (structured) {
        if (isCollaborativeMode()) {
          try { await updateRemoteAgentRun(runId, { outputs: { text: fullOutput, structured } }); }
          catch (syncError) { console.error("Structured agent output sync failed:", syncError); }
        } else await localDB.agentRuns.update(runId, { outputs: { text: fullOutput, structured } });
      }
    } catch {
      // Structured parsing is best-effort; don't fail the run
    }

    // The AI response is complete at this point. Do not turn a successful
    // generation into a failed run just because the optional audit write fails.
    onComplete(runId);

    // Write audit entry as a best-effort follow-up. Hashing is also optional:
    // a crypto/runtime failure must never turn a completed model run into a
    // failed run after onComplete has already notified the UI.
    try {
      const [promptHash, inputHash, outputHash] = await Promise.all([
        hashContent(effectiveSystemPrompt + effectiveUserPrompt),
        hashContent(JSON.stringify(input)),
        hashContent(fullOutput),
      ]);
      await writeAuditEntry({
        projectId,
        agentRunId: runId,
        actor: "local",
        action: `agent.${agentId}`,
        promptHash,
        inputHash,
        outputHash,
      });
    } catch (auditError) {
      console.error("Agent output saved, but audit entry failed:", auditError);
    }
  } catch (error) {
    const failedRun = { status: "failed", endedAt: new Date().toISOString() } as const;
    try {
      if (isCollaborativeMode()) await updateRemoteAgentRun(runId, failedRun);
      else await localDB.agentRuns.update(runId, failedRun);
    } catch (syncError) {
      console.error("Failed to persist agent failure status:", syncError);
    }
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object"
        ? JSON.stringify(error)
        : String(error);
    onError(new Error(message));
  }
}



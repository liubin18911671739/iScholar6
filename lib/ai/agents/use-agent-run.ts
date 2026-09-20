/**
 * useAgentRun Hook (lib/ai/agents/use-agent-run.ts)
 *
 * Functionality:
 * - Client hook that manages an agent run's status, progress, results, and run id.
 * - Streams output through {@link runAgentStream} and estimates progress from chars/tokens.
 * - Persists approve/reject/apply transitions and writes audit entries.
 * - Reads coach/production training context from the URL query string.
 *
 * Notes:
 * - Client-only ("use client"); progress is calibrated from the last approved run's tokenOut.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { runAgentStream } from "@/lib/ai/agents";
import { getAgentMeta, isBuiltInAgent, type AgentId, type BuiltInAgentId } from "@/lib/ai/agents/registry";
import { parseAgentOutput, type AgentStructuredOutput } from "@/lib/ai/parse-agent-output";
import { localDB } from "@/lib/local/db";
import type { LocalAiConsent } from "@/lib/local/db";
import { writeAuditEntry } from "@/lib/audit/ledger";
import { getLatestApprovedRun } from "@/lib/local/hooks/agent-runs";
import { isCollaborativeMode, updateRemoteAgentRun } from "@/lib/supabase/collaborative";
import { getPluginAgent } from "@/lib/plugins/registry";
import type { AgentStatus } from "@/components/agents/agent-workspace";

// Normalize varied error shapes (Error/string/object) into a user-facing message.
function formatAgentError(error: unknown) {
  const consentCode = ["AI", "CALL", "REQUIRES", "CONSENT"].join("_");
  const normalize = (message: string) => {
    if (message.includes(consentCode)) return "请先确认脱敏并允许发送到外部 AI 服务";
    if (message.includes("agent_runs") && message.includes("row-level security")) {
      return "运行记录暂时无法写入云端，但模型调用可继续；请检查 Supabase service_role 配置。";
    }
    return message;
  };

  if (error instanceof Error) {
    if (error.message) return normalize(error.message);
    try { return JSON.stringify(error); } catch { return "Agent request failed (empty Error)"; }
  }
  if (typeof error === "string") return normalize(error);
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const detail = value.error ?? value.message ?? value.details;
    if (typeof detail === "string") return normalize(detail);
    try { return normalize(JSON.stringify(error)); } catch { return "Unknown agent error"; }
  }
  const text = String(error);
  return text === "[object Object]" ? "Agent request failed (unserializable object)" : normalize(text);
}

/**
 * Default token estimates per agent, used as fallback when no historical
 * data is available for progress-bar calibration.
 * (~4 chars per token, total output length varies by agent complexity.)
 */
const AGENT_ESTIMATED_TOKENS: Record<BuiltInAgentId, number> = {
  topic: 800,
  litreview: 2000,
  design: 1200,
  data: 1500,
  write: 1500,
  submit: 1000,
  rebuttal: 1200,
};

// Resolve the fallback token estimate for a built-in or plugin agent.
function estimateTokensForAgent(agentId: AgentId): number {
  if (isBuiltInAgent(agentId)) return AGENT_ESTIMATED_TOKENS[agentId];
  return getPluginAgent(agentId)?.estimatedTokens ?? 1200;
}

/** State and action handlers returned by {@link useAgentRun}. */
interface UseAgentRunReturn {
  status: AgentStatus;
  progress: number;
  results: string;
  errorMessage: string | null;
  parsedResults: AgentStructuredOutput | null;
  runId: string | null;
  handleRun: (input: Record<string, unknown>, consent?: LocalAiConsent) => void;
  handleRerun: (consent?: LocalAiConsent) => void;
  handleApprove: () => void;
  handleReject: () => void;
  handleApply: () => void;
}

/** Hook that drives a single agent run and exposes its lifecycle controls. */
export function useAgentRun(agentId: AgentId, projectIdOverride?: string): UseAgentRunReturn {
  const { projectId: urlProjectId } = useParams<{ projectId?: string }>();
  const searchParams = useSearchParams();
  const projectId = projectIdOverride ?? urlProjectId ?? "";
  const trainingContext = useMemo((): {
    trainingTaskId?: string;
    mode?: "coach" | "production";
  } => {
    const trainingTaskId = searchParams?.get("trainingTaskId") ?? undefined;
    const modeParam = searchParams?.get("mode");
    const mode: "coach" | "production" | undefined =
      modeParam === "coach" || modeParam === "production"
        ? modeParam
        : trainingTaskId
          ? "coach"
          : undefined;
    return { trainingTaskId, mode };
  }, [searchParams]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedResults, setParsedResults] = useState<AgentStructuredOutput | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const agentName = getAgentMeta(agentId)?.name ?? agentId;

  // Start a run, reset state, and stream results into local state.
  const handleRun = useCallback(
    async (input: Record<string, unknown>, consent?: LocalAiConsent) => {
      setStatus("running");
      setProgress(0);
      setResults("");
      setParsedResults(null);
      setErrorMessage(null);

      // Calibrate the progress bar with the actual tokenOut from the
      // previous approved run for this agent+project (if any).
      // Falls back to AGENT_ESTIMATED_TOKENS on first-ever run.
      let estimatedTokens = estimateTokensForAgent(agentId);
      try {
        const prev = await getLatestApprovedRun(projectId, agentId);
        if (prev?.tokenOut && prev.tokenOut > 0) {
          estimatedTokens = prev.tokenOut;
        }
      } catch {
        // Best-effort; fall back to hardcoded estimate
      }

      void runAgentStream({
        agentId,
        projectId,
        input,
        consent,
        mode: trainingContext.mode,
        trainingTaskId: trainingContext.trainingTaskId,
        onChunk: (chunk) => {
          setResults((prev) => {
            const newResults = prev + chunk;
            // Estimate progress from character count (~4 chars per token)
            const currentTokens = newResults.length / 4;
            const newProgress = Math.min(
              Math.round((currentTokens / estimatedTokens) * 90),
              90
            );
            setProgress(newProgress);
            return newResults;
          });
        },
        onComplete: (id) => {
          setRunId(id);
          setProgress(100);
          setStatus("needs_review");

          // Parse structured output from the accumulated text
          setResults((currentResults) => {
            const parsed = parseAgentOutput(agentId, currentResults);
            if (parsed) {
              setParsedResults(parsed);
            }
            return currentResults;
          });
        },
        onError: (error) => {
          console.error(`Agent ${agentId} failed:`, error);
          const message = formatAgentError(error);
          setErrorMessage(message);
          setStatus("failed");
          if (typeof window !== "undefined") window.alert(`${agentName} 运行失败：${message}`);
        },
      }).catch((error: unknown) => {
        const normalized = new Error(formatAgentError(error));
        console.error(`Agent ${agentId} failed before streaming:`, normalized);
        setErrorMessage(normalized.message);
        setStatus("failed");
        if (typeof window !== "undefined") window.alert(`${agentName} 运行失败：${normalized.message}`);
      });
    },
    [agentId, agentName, projectId, trainingContext.mode, trainingContext.trainingTaskId]
  );

  // Mark the run approved and persist the status change (best-effort).
  const handleApprove = useCallback(async () => {
    setStatus("approved");
    if (runId) {
      try {
        const patch = {
          status: "approved",
          endedAt: new Date().toISOString(),
        } as const;
        if (isCollaborativeMode()) await updateRemoteAgentRun(runId, patch);
        else await localDB.agentRuns.update(runId, patch);
        await writeAuditEntry({
          projectId,
          agentRunId: runId,
          actor: "local",
          action: "agent.approved",
        });
      } catch {
        // Persistence failure — status is already set locally
      }
    }
  }, [runId, projectId]);

  // Mark the run rejected and persist the status change (best-effort).
  const handleReject = useCallback(async () => {
    setStatus("idle");
    if (runId) {
      try {
        const patch = {
          status: "rejected",
          endedAt: new Date().toISOString(),
        } as const;
        if (isCollaborativeMode()) await updateRemoteAgentRun(runId, patch);
        else await localDB.agentRuns.update(runId, patch);
        await writeAuditEntry({
          projectId,
          agentRunId: runId,
          actor: "local",
          action: "agent.rejected",
        });
      } catch {
        // Persistence failure — status is already set locally
      }
    }
  }, [runId, projectId]);

  // Mark the run applied and persist the status change (best-effort).
  const handleApply = useCallback(async () => {
    setStatus("applied");
    if (runId) {
      try {
        const patch = {
          status: "applied",
          endedAt: new Date().toISOString(),
        } as const;
        if (isCollaborativeMode()) await updateRemoteAgentRun(runId, patch);
        else await localDB.agentRuns.update(runId, patch);
        await writeAuditEntry({
          projectId,
          agentRunId: runId,
          actor: "local",
          action: "agent.applied",
        });
      } catch {
        // Persistence failure — status is already set locally
      }
    }
  }, [runId, projectId]);

  // Rerun just resets and re-runs with the last input
  const [lastInput, setLastInput] = useState<Record<string, unknown>>({});

  // Wrap handleRun so the latest input can be replayed on rerun.
  const handleRunWithMemory = useCallback(
    (input: Record<string, unknown>, consent?: LocalAiConsent) => {
      setLastInput(input);
      handleRun(input, consent);
    },
    [handleRun]
  );

  const handleRerun = useCallback((consent?: LocalAiConsent) => {
    handleRun(lastInput, consent);
  }, [handleRun, lastInput]);

  return {
    status,
    progress,
    results,
    errorMessage,
    parsedResults,
    runId,
    handleRun: handleRunWithMemory,
    handleRerun,
    handleApprove,
    handleReject,
    handleApply,
  };
}

/**
 * Backend agent-run hooks (lib/client/hooks/agent-runs.ts)
 *
 * Reads durable runs from `/api/agent/*` and maps them into the legacy
 * `LocalAgentRun` shape consumed by output panels and the workflow stepper.
 *
 * @author mrpi
 * @date 2026-09-30
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { listRuns, type AgentRunDetail } from "@/lib/client/agents";
import { listProjects } from "@/lib/client/data";
import { calculateCostCents } from "@/lib/ai/pricing";
import type { AgentId } from "@/lib/ai/agents/registry";
import type { LocalAgentRun } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import { qk } from "./keys";

const STATUS_MAP: Record<string, LocalAgentRun["status"]> = {
  queued: "queued",
  running: "running",
  waiting_for_input: "needs_review",
  waiting_for_review: "needs_review",
  succeeded: "approved",
  failed: "failed",
  cancelled: "rejected",
};

/** Map a backend run detail into the legacy local-run shape. */
export function toLocalRun(run: AgentRunDetail): LocalAgentRun {
  const artifact = run.artifacts[run.artifacts.length - 1];
  const tokenIn = artifact?.content.usage?.tokenIn ?? 0;
  const tokenOut = artifact?.content.usage?.tokenOut ?? 0;
  const started = run.startedAt ? new Date(run.startedAt).getTime() : null;
  const ended = run.completedAt ? new Date(run.completedAt).getTime() : null;
  // A reviewed artifact wins over the run status (approve/apply happen without
  // resuming the run).
  const artifactStatus = artifact?.status;
  const status: LocalAgentRun["status"] =
    artifactStatus === "approved" || artifactStatus === "applied" || artifactStatus === "rejected"
      ? artifactStatus
      : STATUS_MAP[run.status] ?? "queued";
  return {
    id: run.id,
    projectId: run.projectId,
    agent: run.agent as AgentId,
    status,
    inputs: run.input ?? undefined,
    outputs: artifact
      ? { structured: artifact.content.structured, text: artifact.content.text }
      : undefined,
    tokenIn,
    tokenOut,
    costCents: tokenIn || tokenOut ? calculateCostCents("deepseek-chat", tokenIn, tokenOut) : undefined,
    latencyMs: started != null && ended != null ? ended - started : undefined,
    startedAt: run.startedAt ?? run.createdAt,
    endedAt: run.completedAt ?? undefined,
    mode: (run.mode as "coach" | "production" | null) ?? undefined,
    trainingTaskId: run.trainingTaskId ?? undefined,
  };
}

export async function listAllRuns(limit = 200): Promise<LocalAgentRun[]> {
  const projects = await listProjects();
  const perProject = await Promise.all(
    projects.slice(0, 20).map((project) => listRuns(project.id).catch(() => [] as AgentRunDetail[]))
  );
  return perProject
    .flat()
    .map(toLocalRun)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

/** Lists a project's runs, newest first. */
export function useLocalAgentRuns(projectId: string): RemoteListQuery<LocalAgentRun> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.agentRuns(projectId),
    queryFn: () => listRuns(projectId).then((runs) => runs.map(toLocalRun)),
    enabled: Boolean(projectId),
  });
  return { data, error: error ? String(error) : null, refetch };
}

/** Lists every run visible to the caller across projects, newest first. */
export function useLocalAllAgentRuns(): RemoteListQuery<LocalAgentRun> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.allAgentRuns,
    queryFn: () => listAllRuns(),
  });
  return { data, error: error ? String(error) : null, refetch };
}

const COMPLETED = new Set(["approved", "applied", "needs_review"]);

/** Newest approved/applied/needs_review run for a project+agent. */
export function useLatestAgentRun(projectId: string, agentId: AgentId): LocalAgentRun | null {
  const runs = useLocalAgentRuns(projectId).data;
  if (!runs) return null;
  const filtered = runs
    .filter((run) => run.agent === agentId && COMPLETED.has(run.status))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return filtered[0] ?? null;
}

/** Set of agent ids with at least one approved/applied run for a project. */
export function useWorkflowProgress(projectId: string): Set<string> {
  const runs = useLocalAgentRuns(projectId).data;
  const latest = new Map<string, LocalAgentRun>();
  for (const run of runs ?? []) {
    const existing = latest.get(run.agent);
    if (!existing || new Date(run.startedAt).getTime() > new Date(existing.startedAt).getTime()) {
      latest.set(run.agent, run);
    }
  }
  return new Set(
    Array.from(latest.values())
      .filter((run) => run.status === "approved" || run.status === "applied")
      .map((run) => run.agent)
  );
}

/** Newest run for an agent with status approved or applied. */
export async function getLatestApprovedRun(
  projectId: string,
  agent: AgentId
): Promise<LocalAgentRun | undefined> {
  const runs = (await listRuns(projectId)).map(toLocalRun);
  return runs.find((run) => run.agent === agent && (run.status === "approved" || run.status === "applied"));
}

/** Input fields from the latest run for a project+agent (form restore). */
export async function getLatestAgentRunInputs(
  projectId: string,
  agentId: AgentId
): Promise<Record<string, string> | null> {
  const runs = (await listRuns(projectId)).map(toLocalRun);
  const latest = runs.find((run) => run.agent === agentId && run.inputs != null);
  if (!latest?.inputs) return null;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(latest.inputs)) {
    if (typeof value === "string") result[key] = value;
    else if (Array.isArray(value)) result[key] = value.join(", ");
  }
  return Object.keys(result).length > 0 ? result : null;
}

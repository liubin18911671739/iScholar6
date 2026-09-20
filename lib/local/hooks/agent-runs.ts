/**
 * Agent Run Hooks (lib/local/hooks/agent-runs.ts)
 *
 * Functionality:
 * - Reads agent run records from Dexie `agentRuns` and/or Supabase `agent_runs`, preferring remote in collaborative mode.
 * - Exposes hooks for per-project runs, all runs, workflow progress checkmarks, and the latest run per agent.
 * - Provides status transitions plus helpers to fetch the latest approved run and restore form inputs.
 *
 * Notes:
 * - Dual-mode: IndexedDB via Dexie vs. collaborative Supabase (isCollaborativeMode).
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { localDB, type LocalAgentRun } from "../db";
import { type AgentId } from "@/lib/ai/agents/registry";
import { getCollaborativeClient, isCollaborativeMode, updateRemoteAgentRun } from "@/lib/supabase/collaborative";
import { fromRemoteRecord } from "@/lib/supabase/field-map";
import { useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";
import { resolveListQuery } from "./utils";

/** Lists agent runs for a project, newest first. */
export function useLocalAgentRuns(projectId: string): RemoteListQuery<LocalAgentRun> {
  const remote = useRemoteRows<LocalAgentRun>("agent_runs", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.agentRuns.where("projectId").equals(projectId).reverse().sortBy("startedAt"),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/** Lists every agent run across all projects, newest first. */
export function useLocalAllAgentRuns(): RemoteListQuery<LocalAgentRun> {
  const remote = useRemoteRows<LocalAgentRun>("agent_runs");
  const local = useLiveQuery(
    () => localDB.agentRuns.orderBy("startedAt").reverse().toArray(),
    []
  );
  return resolveListQuery(remote, local);
}

/** Sets a run's final status and stamps endedAt, remote or local. */
export async function updateAgentRunStatus(
  runId: string,
  status: LocalAgentRun["status"]
) {
  const patch = {
    status,
    endedAt: new Date().toISOString(),
  };
  if (isCollaborativeMode()) await updateRemoteAgentRun(runId, patch);
  else await localDB.agentRuns.update(runId, patch);
}

// Loads a project's runs from Supabase (collaborative) or Dexie, newest first.
async function listAgentRunsForProject(projectId: string): Promise<LocalAgentRun[]> {
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) return [];
    const { data, error } = await client
      .from("agent_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false });
    if (error) {
      console.error("Supabase agent_runs list failed", error);
      return [];
    }
    return (data ?? []).map((row) => fromRemoteRecord(row as Record<string, unknown>) as unknown as LocalAgentRun);
  }
  return localDB.agentRuns
    .where("projectId")
    .equals(projectId)
    .reverse()
    .sortBy("startedAt");
}

/** Finds the newest run for an agent whose status is approved or applied. */
export async function getLatestApprovedRun(
  projectId: string,
  agent: AgentId
): Promise<LocalAgentRun | undefined> {
  const runs = await listAgentRunsForProject(projectId);
  return runs.find(
    (r) => r.agent === agent && (r.status === "approved" || r.status === "applied")
  );
}

/**
 * Returns the input fields from the latest agent run for a given project+agent.
 * Used to restore form field state when revisiting a module page.
 */
export async function getLatestAgentRunInputs(
  projectId: string,
  agentId: AgentId
): Promise<Record<string, string> | null> {
  const runs = (await listAgentRunsForProject(projectId)).filter(
    (r) => r.agent === agentId && r.inputs != null
  );
  if (!runs[0]?.inputs) return null;
  const inputs = runs[0].inputs as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === "string") result[key] = value;
    else if (Array.isArray(value)) result[key] = value.join(", ");
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Returns a Set of agent IDs that have at least one approved or applied run
 * for the given project. Used by WorkflowStepper to show data-driven checkmarks.
 */
export function useWorkflowProgress(projectId: string): Set<string> {
  const remoteRuns = useRemoteRows<LocalAgentRun>("agent_runs", "project_id", projectId);
  const localRuns = useLiveQuery(
    () => localDB.agentRuns.where("projectId").equals(projectId).toArray(),
    [projectId]
  );
  const runs = isCollaborativeMode() ? remoteRuns.data : localRuns;
  return useMemo(() => {
    const latest = new Map<string, { status: string; startedAt: string }>();
    for (const r of runs ?? []) {
      const existing = latest.get(r.agent);
      if (!existing || new Date(r.startedAt).getTime() > new Date(existing.startedAt).getTime()) {
        latest.set(r.agent, { status: r.status, startedAt: r.startedAt });
      }
    }
    return new Set(Array.from(latest.entries()).filter(([, v]) => v.status === "approved" || v.status === "applied").map(([agent]) => agent));
  }, [runs]);
}

/** Returns the newest approved/applied/needs_review run for a project+agent, remote-first. */
export function useLatestAgentRun(projectId: string, agentId: AgentId) {
  const remoteRuns = useRemoteRows<LocalAgentRun>("agent_runs", "project_id", projectId);
  const localRun = useLiveQuery(async () => {
    const runs = await localDB.agentRuns
      .where("projectId")
      .equals(projectId)
      .toArray();
    const filtered = runs
      .filter(
        (r) =>
          r.agent === agentId &&
          (r.status === "approved" || r.status === "applied" || r.status === "needs_review")
      )
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return filtered[0] ?? null;
  }, [projectId, agentId]);
  const remoteRun = useMemo(() => (remoteRuns.data ?? [])
    .filter((r) => r.agent === agentId && (r.status === "approved" || r.status === "applied" || r.status === "needs_review"))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] ?? null, [remoteRuns.data, agentId]);
  return isCollaborativeMode() ? remoteRun : localRun;
}

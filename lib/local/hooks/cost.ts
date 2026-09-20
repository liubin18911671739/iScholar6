/**
 * Cost Summary Hook (lib/local/hooks/cost.ts)
 *
 * Functionality:
 * - Aggregates agent run token/cost/latency metrics across completed runs.
 * - Produces totals, per-agent breakdowns, and per-day cost/token series.
 * - Reads Dexie `agentRuns` in local mode or Supabase `agent_runs` in collaborative mode.
 *
 * Notes:
 * - Collaborative mode returns undefined while remote row loading is unresolved.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB } from "../db";
import { type AgentId } from "@/lib/ai/agents/registry";
import { format } from "date-fns";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { useRemoteRows } from "@/lib/supabase/remote-query";
import type { LocalAgentRun } from "../db";

/** Aggregated spend, token, latency, and per-agent/per-day cost metrics. */
export interface CostSummary {
  totalCostCents: number;
  totalTokenIn: number;
  totalTokenOut: number;
  totalRuns: number;
  avgLatencyMs: number;
  costByAgent: Array<{ agent: AgentId; costCents: number; runs: number }>;
  costByDay: Array<{ date: string; costCents: number; tokens: number }>;
}

/** Computes dashboard cost metrics from local or remote agent runs. */
export function useCostSummary() {
  const remoteRuns = useRemoteRows<LocalAgentRun>("agent_runs");
  const localSummary = useLiveQuery(async () => {
    const runs = await localDB.agentRuns
      .where("status")
      .anyOf(["needs_review", "approved", "applied", "rejected"])
      .toArray();

    const withCost = runs.filter((r) => r.costCents != null && r.costCents > 0);

    const totalCostCents = withCost.reduce((sum, r) => sum + (r.costCents ?? 0), 0);
    const totalTokenIn = withCost.reduce((sum, r) => sum + (r.tokenIn ?? 0), 0);
    const totalTokenOut = withCost.reduce((sum, r) => sum + (r.tokenOut ?? 0), 0);
    const totalRuns = withCost.length;
    const avgLatencyMs = totalRuns > 0
      ? Math.round(withCost.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) / totalRuns)
      : 0;

    // Cost by agent
    const agentMap = new Map<AgentId, { costCents: number; runs: number }>();
    for (const r of withCost) {
      const existing = agentMap.get(r.agent) ?? { costCents: 0, runs: 0 };
      existing.costCents += r.costCents ?? 0;
      existing.runs += 1;
      agentMap.set(r.agent, existing);
    }
    const costByAgent = Array.from(agentMap.entries()).map(([agent, data]) => ({
      agent,
      ...data,
    }));

    // Cost by day
    const dayMap = new Map<string, { costCents: number; tokens: number }>();
    for (const r of withCost) {
      const day = r.endedAt ? format(new Date(r.endedAt), "yyyy-MM-dd") : "unknown";
      const existing = dayMap.get(day) ?? { costCents: 0, tokens: 0 };
      existing.costCents += r.costCents ?? 0;
      existing.tokens += (r.tokenIn ?? 0) + (r.tokenOut ?? 0);
      dayMap.set(day, existing);
    }
    const costByDay = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { totalCostCents, totalTokenIn, totalTokenOut, totalRuns, avgLatencyMs, costByAgent, costByDay } satisfies CostSummary;
  }, []);
  if (isCollaborativeMode()) {
    // Keep loading as undefined so the dashboard can distinguish empty vs loading.
    if (remoteRuns.data === undefined) return undefined;
    const runs = Array.isArray(remoteRuns.data) ? remoteRuns.data : [];
    return summarizeRuns(runs);
  }
  return localSummary;
}

// Same aggregation as the local path, applied to collaborative remote rows.
function summarizeRuns(runs: LocalAgentRun[]): CostSummary {
  const list = Array.isArray(runs) ? runs : [];
  const withCost = list.filter((r) => ["needs_review", "approved", "applied", "rejected"].includes(r.status) && (r.costCents ?? 0) > 0);
  const totalCostCents = withCost.reduce((sum, r) => sum + (r.costCents ?? 0), 0);
  const totalTokenIn = withCost.reduce((sum, r) => sum + (r.tokenIn ?? 0), 0);
  const totalTokenOut = withCost.reduce((sum, r) => sum + (r.tokenOut ?? 0), 0);
  const agentMap = new Map<AgentId, { costCents: number; runs: number }>();
  const dayMap = new Map<string, { costCents: number; tokens: number }>();
  for (const r of withCost) {
    const agent = agentMap.get(r.agent) ?? { costCents: 0, runs: 0 };
    agent.costCents += r.costCents ?? 0; agent.runs += 1; agentMap.set(r.agent, agent);
    const date = r.endedAt ? format(new Date(r.endedAt), "yyyy-MM-dd") : "unknown";
    const day = dayMap.get(date) ?? { costCents: 0, tokens: 0 };
    day.costCents += r.costCents ?? 0; day.tokens += (r.tokenIn ?? 0) + (r.tokenOut ?? 0); dayMap.set(date, day);
  }
  return { totalCostCents, totalTokenIn, totalTokenOut, totalRuns: withCost.length,
    avgLatencyMs: withCost.length ? Math.round(withCost.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) / withCost.length) : 0,
    costByAgent: Array.from(agentMap.entries()).map(([agent, data]) => ({ agent, ...data })),
    costByDay: Array.from(dayMap.entries()).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date)) };
}

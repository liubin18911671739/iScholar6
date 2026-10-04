/**
 * Backend cost summary hook (lib/client/hooks/cost.ts)
 *
 * Aggregates token/cost/latency metrics from backend agent runs.
 *
 * @author mrpi
 * @date 2026-09-30
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { AgentId } from "@/lib/ai/agents/registry";
import type { LocalAgentRun } from "@/lib/types/domain";
import { listAllRuns } from "./agent-runs";

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

const COMPLETED = new Set(["needs_review", "approved", "applied", "rejected"]);

/** Aggregate cost metrics from a run list. */
export function summarizeRuns(runs: LocalAgentRun[]): CostSummary {
  const withCost = (runs ?? []).filter((r) => COMPLETED.has(r.status) && (r.costCents ?? 0) > 0);
  const totalCostCents = withCost.reduce((sum, r) => sum + (r.costCents ?? 0), 0);
  const totalTokenIn = withCost.reduce((sum, r) => sum + (r.tokenIn ?? 0), 0);
  const totalTokenOut = withCost.reduce((sum, r) => sum + (r.tokenOut ?? 0), 0);
  const agentMap = new Map<AgentId, { costCents: number; runs: number }>();
  const dayMap = new Map<string, { costCents: number; tokens: number }>();
  for (const run of withCost) {
    const agent = agentMap.get(run.agent) ?? { costCents: 0, runs: 0 };
    agent.costCents += run.costCents ?? 0;
    agent.runs += 1;
    agentMap.set(run.agent, agent);
    const date = run.endedAt ? format(new Date(run.endedAt), "yyyy-MM-dd") : "unknown";
    const day = dayMap.get(date) ?? { costCents: 0, tokens: 0 };
    day.costCents += run.costCents ?? 0;
    day.tokens += (run.tokenIn ?? 0) + (run.tokenOut ?? 0);
    dayMap.set(date, day);
  }
  return {
    totalCostCents,
    totalTokenIn,
    totalTokenOut,
    totalRuns: withCost.length,
    avgLatencyMs: withCost.length
      ? Math.round(withCost.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) / withCost.length)
      : 0,
    costByAgent: Array.from(agentMap.entries()).map(([agent, data]) => ({ agent, ...data })),
    costByDay: Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Dashboard cost metrics from backend agent runs. */
export function useCostSummary(): CostSummary | undefined {
  const { data } = useQuery({
    queryKey: ["cost"],
    queryFn: async () => summarizeRuns(await listAllRuns()),
  });
  return data;
}

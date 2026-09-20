/**
 * cost-charts (components/dashboard/cost-charts.tsx)
 *
 * Functionality:
 * - Dashboard cost visualizations: summary stat cards, cost-by-agent bar chart, and cost-over-time area chart.
 * - Formats currency/tokens via pricing helpers and resolves human-readable agent names from the registry.
 * - Each exported card/chart renders nothing when its input is missing or empty.
 *
 * Notes:
 * - Uses recharts and shadcn Card; input is the `CostSummary` shape from local hooks.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { type CostSummary } from "@/lib/local/hooks";
import { formatCostCents, formatTokenCount } from "@/lib/ai/pricing";
import { getAgentMeta } from "@/lib/ai/agents/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { DollarSign, Zap, Timer, Hash } from "lucide-react";

const chartCardClass = "border-blue-400/20 bg-card/95 shadow-[0_12px_40px_-24px_rgba(15,98,254,0.65)]";
const chartTick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

// Single metric tile with a title, formatted value, and icon.
function StatCard({ title, value, icon: Icon }: { title: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className={chartCardClass}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-blue-200" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

/** Four-tile summary of total cost, tokens, runs, and average latency. */
export function CostSummaryCards({ data }: { data: CostSummary | undefined }) {
  const t = useTranslations("dashboard");

  if (!data || data.totalRuns === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={t("costTotal")}
        value={formatCostCents(data.totalCostCents)}
        icon={DollarSign}
      />
      <StatCard
        title={t("totalTokens")}
        value={formatTokenCount(data.totalTokenIn + data.totalTokenOut)}
        icon={Hash}
      />
      <StatCard
        title={t("totalRuns")}
        value={String(data.totalRuns)}
        icon={Zap}
      />
      <StatCard
        title={t("avgLatency")}
        value={`${(data.avgLatencyMs / 1000).toFixed(1)}s`}
        icon={Timer}
      />
    </div>
  );
}

/** Bar chart of cost (dollars) grouped by agent. */
export function CostByAgentChart({ data }: { data: CostSummary | undefined }) {
  const t = useTranslations("dashboard");

  if (!data || data.costByAgent.length === 0) return null;

  const chartData = data.costByAgent.map((d) => ({
    name: getAgentMeta(d.agent)?.name ?? d.agent,
    cost: d.costCents / 100,
    runs: d.runs,
  }));

  return (
    <Card className={chartCardClass}>
      <CardHeader>
        <CardTitle className="text-sm">{t("costByAgent")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={chartTick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis tick={chartTick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={{ stroke: "hsl(var(--border))" }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
                fontSize: 12,
              }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(4)}`, t("cost")]}
            />
            <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Area chart of daily cost and token usage over time. */
export function CostOverTimeChart({ data }: { data: CostSummary | undefined }) {
  const t = useTranslations("dashboard");

  if (!data || data.costByDay.length === 0) return null;

  const chartData = data.costByDay.map((d) => ({
    date: d.date.slice(5), // MM-DD
    cost: d.costCents / 100,
    tokens: d.tokens,
  }));

  return (
    <Card className={chartCardClass}>
      <CardHeader>
        <CardTitle className="text-sm">{t("costOverTime")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={chartTick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis tick={chartTick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={{ stroke: "hsl(var(--border))" }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
                fontSize: 12,
              }}
              formatter={(value, name) => [
                name === "cost" ? `$${Number(value ?? 0).toFixed(4)}` : formatTokenCount(Number(value ?? 0)),
                name === "cost" ? t("cost") : t("tokens"),
              ]}
            />
            <Area type="monotone" dataKey="cost" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

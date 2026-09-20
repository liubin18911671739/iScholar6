/**
 * TopicOutputPanel (components/agents/outputs/topic-output.tsx)
 *
 * Functionality:
 * - Displays the latest "topic" run: a novelty/value/feasibility bar chart, topic cards, and an audit ledger.
 * - Computes chart data from the parsed topics and filters audit entries to the current run.
 * - Shows progress bars for each topic's novelty, value, and feasibility scores.
 *
 * Notes:
 * - Reads runs and audit entries via `useLatestAgentRun` / `useLocalAuditEntries`; uses recharts.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLatestAgentRun, useLocalAuditEntries } from "@/lib/local/hooks";
import { type AgentStructuredOutput, type TopicOutput } from "@/lib/ai/parse-agent-output";
import { EmptyState } from "./shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

/** Props for `TopicOutputPanel`: the owning project id. */
interface TopicOutputPanelProps {
  projectId: string;
}

/** Renders structured output from the Topic agent run. */
export function TopicOutputPanel({ projectId }: TopicOutputPanelProps) {
  const t = useTranslations("output.topic");
  const latestRun = useLatestAgentRun(projectId, "topic");
  const { data: auditEntries } = useLocalAuditEntries(projectId);

  // Extract data before early return so hooks stay unconditional
  const structured = latestRun?.outputs?.structured as AgentStructuredOutput | undefined;
  const topicData = structured as TopicOutput | undefined;
  const topics = useMemo(() => topicData?.topics ?? [], [topicData?.topics]);

  // Memoized to prevent recharts infinite re-render
  const chartData = useMemo(
    () =>
      topics.map((topic) => ({
        name: topic.title.length > 20 ? topic.title.slice(0, 20) + "…" : topic.title,
        novelty: topic.novelty,
        value: topic.value,
        feasibility: topic.feasibility,
      })),
    [topics]
  );

  // Audit entries belonging to the currently displayed run.
  const auditForAgent = useMemo(
    () => (auditEntries ?? []).filter((e) => e.agentRunId === latestRun?.id),
    [auditEntries, latestRun?.id]
  );

  if (!latestRun) {
    return (
      <EmptyState
        title={t("title")}
        description={t("hint")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">{t("score")}</h3>
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="w-full h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                domain={[0, 10]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="novelty" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="feasibility" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Topic list */}
      {topics.map((topic, i) => (
        <div key={i} className="rounded-md border p-2 space-y-1.5">
          <p className="text-xs font-medium leading-tight">{topic.title}</p>
          <p className="text-[10px] text-muted-foreground line-clamp-2">{topic.gap}</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-[9px] text-muted-foreground">{t("novelty")}</p>
              <Progress value={topic.novelty * 10} className="h-1.5" />
            </div>
            <div className="flex-1">
              <p className="text-[9px] text-muted-foreground">{t("value")}</p>
              <Progress value={topic.value * 10} className="h-1.5" />
            </div>
            <div className="flex-1">
              <p className="text-[9px] text-muted-foreground">{t("feasibility")}</p>
              <Progress value={topic.feasibility * 10} className="h-1.5" />
            </div>
          </div>
        </div>
      ))}

      {/* Audit Ledger */}
      {auditForAgent.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">{t("auditLog")}</h4>
          <ScrollArea className="max-h-[100px]">
            <div className="space-y-1">
              {auditForAgent.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-border/50 pb-1"
                >
                  <Badge variant="outline" className="h-4 text-[9px] px-1">
                    {entry.action.replace("agent.", "")}
                  </Badge>
                  <span className="truncate max-w-[80px]" title={entry.outputHash}>
                    {entry.outputHash ?? "—"}
                  </span>
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

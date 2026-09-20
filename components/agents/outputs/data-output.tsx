/**
 * DataOutputPanel (components/agents/outputs/data-output.tsx)
 *
 * Functionality:
 * - Displays the latest "data" agent run: generated analysis scripts, analysis plan steps, and recommendations.
 * - Attempts to derive a bar chart from numeric "Key: value" lines in the recommendations/analysis plan.
 * - Supports copying each generated script to the clipboard with a transient check indicator.
 *
 * Notes:
 * - Reads runs via `useLatestAgentRun` and chart values from `lib/ai/parse-agent-output`; uses recharts and shadcn UI.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLatestAgentRun } from "@/lib/local/hooks";
import { type AgentStructuredOutput, type DataOutput } from "@/lib/ai/parse-agent-output";
import { EmptyState } from "./shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Code, BarChart3, CheckCircle2, Copy, Check, PieChartIcon } from "lucide-react";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

// Parse potential chart data from AI output recommendations/analysis plan
// Attempts to extract key-value pairs from lines like "Accuracy: 0.85" or "- Sample size: 500"
function tryParseChartData(items: string[]): Array<Record<string, string | number>> | null {
  const parsed: Array<Record<string, string | number>> = [];

  for (const item of items) {
    // Match patterns like "Key: value" or "Key = value" where value is a number
    const match = item.match(/^(?:[-•*]\s*)?(.+?)\s*[:=]\s*([\d.]+)\s*%?$/);
    if (match) {
      const name = match[1].trim().slice(0, 25);
      const value = parseFloat(match[2]);
      if (name && !isNaN(value)) {
        parsed.push({ name, value });
      }
    }
  }

  return parsed.length >= 2 ? parsed : null;
}

/** Props for `DataOutputPanel`: the owning project id. */
interface DataOutputPanelProps {
  projectId: string;
}

/** Renders structured output from the Data agent run. */
export function DataOutputPanel({ projectId }: DataOutputPanelProps) {
  const t = useTranslations("output.data");
  const tCommon = useTranslations("common");
  const latestRun = useLatestAgentRun(projectId, "data");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Extract data before early return so hooks stay unconditional
  const structured = latestRun?.outputs?.structured as AgentStructuredOutput | undefined;
  const dataData = structured as DataOutput | undefined;
  const scripts = dataData?.scripts ?? [];
  const recommendations = useMemo(() => dataData?.recommendations ?? [], [dataData?.recommendations]);
  const analysisPlan = useMemo(() => dataData?.analysisPlan ?? [], [dataData?.analysisPlan]);

  // Memoized to prevent recharts infinite re-render
  const chartData = useMemo(
    () => tryParseChartData(recommendations) ?? tryParseChartData(analysisPlan),
    [recommendations, analysisPlan]
  );

  if (!latestRun) {
    return (
      <EmptyState
        title={t("title")}
        description={t("hint")}
      />
    );
  }

  function handleCopy(code: string, idx: number) {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Visualization */}
      {chartData && chartData.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">{t("visualizations")}</h3>
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  angle={-20}
                  textAnchor="end"
                  height={40}
                />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "4px",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Scripts */}
      {scripts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">{t("generatedScripts")}</h3>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-2">
              {scripts.map((script, i) => (
                <div key={i} className="rounded-md border overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/50 px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">
                        {script.language}
                      </Badge>
                      <span className="text-[10px] font-medium">
                        {script.filename ?? `script.${script.language === "python" ? "py" : script.language === "r" ? "R" : "txt"}`}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleCopy(script.code, i)}
                    >
                      {copiedIdx === i ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <pre className="text-[10px] p-2 overflow-x-auto bg-background">
                    <code>{script.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Analysis Plan */}
      {analysisPlan.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-medium">{t("analysisPlan")}</h4>
          </div>
          <div className="space-y-1">
            {analysisPlan.map((step, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                  {i + 1}
                </Badge>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-medium">{t("suggestions")}</h4>
          </div>
          <ul className="space-y-0.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px]">
                <span className="text-primary mt-0.5">✓</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scripts.length === 0 && recommendations.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {tCommon("noData")}
        </p>
      )}
    </div>
  );
}

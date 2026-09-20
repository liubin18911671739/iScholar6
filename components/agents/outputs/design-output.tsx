/**
 * DesignOutputPanel (components/agents/outputs/design-output.tsx)
 *
 * Functionality:
 * - Shows the latest "design" agent run's feasibility score, per-factor breakdown, hypotheses, and variables.
 * - Colours scores/progress bars green, yellow, or red by threshold (>=7, >=4, else).
 * - Renders an empty state when no run exists and a "no data" hint when feasibility is missing.
 *
 * Notes:
 * - Reads runs via `useLatestAgentRun` and types from `lib/ai/parse-agent-output`; uses Progress/Badge primitives.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { useLatestAgentRun } from "@/lib/local/hooks";
import { type AgentStructuredOutput, type DesignOutput } from "@/lib/ai/parse-agent-output";
import { EmptyState } from "./shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck } from "lucide-react";

/** Props for `DesignOutputPanel`: the owning project id. */
interface DesignOutputPanelProps {
  projectId: string;
}

// Maps a 0-10 feasibility score to a text colour class.
function scoreColor(score: number): string {
  if (score >= 7) return "text-green-500";
  if (score >= 4) return "text-yellow-500";
  return "text-red-500";
}

// Maps a 0-10 feasibility score to a progress-bar fill class.
function scoreBg(score: number): string {
  if (score >= 7) return "[&>div]:bg-green-500";
  if (score >= 4) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-red-500";
}

/** Renders structured output from the Design agent run. */
export function DesignOutputPanel({ projectId }: DesignOutputPanelProps) {
  const t = useTranslations("output.design");
  const tCommon = useTranslations("common");
  const latestRun = useLatestAgentRun(projectId, "design");

  if (!latestRun) {
    return (
      <EmptyState
        title={t("title")}
        description={t("hint")}
      />
    );
  }

  const structured = latestRun.outputs?.structured as AgentStructuredOutput | undefined;
  const designData = structured as DesignOutput | undefined;
  const feasibility = designData?.feasibility;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">{t("feasibility")}</h3>
      </div>

      {feasibility && (
        <>
          {/* Overall Score */}
          <div className="flex flex-col items-center rounded-md border p-3">
            <p className="text-[10px] text-muted-foreground mb-1">{t("overallFeasibility")}</p>
            <p className={`text-3xl font-bold ${scoreColor(feasibility.score)}`}>
              {feasibility.score}/10
            </p>
            <Progress
              value={feasibility.score * 10}
              className={`h-2 w-full mt-2 ${scoreBg(feasibility.score)}`}
            />
          </div>

          {/* Factor Cards */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground">{t("factorBreakdown")}</p>
            <div className="grid gap-1.5">
              {feasibility.factors.map((factor, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border p-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium truncate">{factor.name}</p>
                    {factor.note && (
                      <p className="text-[9px] text-muted-foreground truncate">{factor.note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Progress
                      value={factor.score * 10}
                      className={`h-1.5 w-16 ${scoreBg(factor.score)}`}
                    />
                    <Badge
                      variant="outline"
                      className={`h-4 text-[9px] px-1 ${scoreColor(factor.score)}`}
                    >
                      {factor.score}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Hypotheses */}
      {designData?.hypotheses && designData.hypotheses.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">{t("hypothesis")}</p>
          <ul className="text-[10px] space-y-0.5">
            {designData.hypotheses.map((h, i) => (
              <li key={i} className="flex items-start gap-1">
                <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                  H{i + 1}
                </Badge>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Variables */}
      {designData?.variables && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">{t("variables")}</p>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(designData.variables).map(([type, vars]) => {
              if (!Array.isArray(vars) || vars.length === 0) return null;
              return (
                <div key={type} className="rounded border p-1.5">
                  <p className="text-[9px] font-medium capitalize text-muted-foreground">{type}</p>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {vars.map((v: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[9px] h-4 px-1">
                        {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!feasibility && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {tCommon("noData")}
        </p>
      )}
    </div>
  );
}

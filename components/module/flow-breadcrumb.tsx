/**
 * Flow Breadcrumb (components/module/flow-breadcrumb.tsx)
 *
 * Functionality:
 * - Shows which earlier stages feed into the current stage and which stages follow it.
 * - Filters and slices the shared `STAGES` sequence so the duplicated data stages appear once.
 * - Renders "received from" upstream stages with a check and "output to" downstream stages with an arrow.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES, getStage } from "./stages";

/** Shows upstream and downstream workflow stages relative to the current stage. */
export function FlowBreadcrumb({ currentStage }: { currentStage: number }) {
  const t = useTranslations("module");

  // De-duplicate the two data stages for display ("数据·分析" collapses to one)
  const prev = STAGES.filter((s) => s.id < currentStage && s.id !== 5);
  const next = STAGES.filter((s) => s.id > currentStage && s.id !== 4).slice(0, 2);

  if (prev.length === 0 && next.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
      {prev.length > 0 && (
        <>
          <span className="text-muted-foreground/70">{t("receivedFrom")}</span>
          <span className="flex items-center gap-1 font-medium text-foreground/80">
            {prev.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground/50">·</span>}
                {s.label}
              </span>
            ))}
            <Check className="h-3 w-3 text-emerald-400" />
          </span>
        </>
      )}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      {next.length > 0 && (
        <>
          <span className="text-muted-foreground/70">{t("outputTo")}</span>
          <span className="flex items-center gap-1 font-medium">
            {next.map((s, i) => (
              <span
                key={s.id}
                className={cn(i === 0 && getStage(currentStage)?.accent.text)}
              >
                {i > 0 && <span className="mr-1 text-muted-foreground/50">·</span>}
                {s.label}
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}

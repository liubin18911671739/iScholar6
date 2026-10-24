/**
 * ResearchPlan Results (components/agents/configs/research-plan/ResearchPlanResults.tsx)
 *
 * Functionality:
 * - Streams the incoming model text, then hosts the WorkflowPanel that owns
 *   gate interactions (direction selection, final approval) for the run.
 *
 * @author mrpi
 * @date 2026-10-23
 */

"use client";

import { useTranslations } from "next-intl";
import { MarkdownText } from "@/components/ui/markdown-text";
import type { ResultsProps } from "../../agent-page-template";
import { WorkflowPanel } from "./WorkflowPanel";

/** Workflow workspace: streamed text plus the gate/stage console. */
export function ResearchPlanResults({ results, runId }: ResultsProps) {
  const t = useTranslations("researchPlan.stream");

  return (
    <div className="space-y-4">
      {results && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("live")}</p>
          <MarkdownText content={results} />
        </div>
      )}
      <WorkflowPanel runId={runId ?? null} />
    </div>
  );
}

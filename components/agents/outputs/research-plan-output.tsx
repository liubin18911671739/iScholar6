/**
 * ResearchPlan Output Panel (components/agents/outputs/research-plan-output.tsx)
 *
 * Functionality:
 * - Shows the completed workflow: the synthesized research plan, quality
 *   verdict, and the selected direction from the latest research-plan run.
 *
 * @author mrpi
 * @date 2026-10-23
 */

"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { MarkdownText } from "@/components/ui/markdown-text";
import { useLatestAgentRun } from "@/lib/hooks";
import { EmptyState } from "./shared/empty-state";

interface ResearchPlanOutputPanelProps {
  projectId: string;
}

/** Renders the final research plan of the latest workflow run. */
export function ResearchPlanOutputPanel({ projectId }: ResearchPlanOutputPanelProps) {
  const t = useTranslations("output.researchPlan");
  const latestRun = useLatestAgentRun(projectId, "research-plan");

  const final = (latestRun?.outputs as unknown as {
    structured?: unknown;
    text?: string;
    finalText?: string;
  } | null) ?? null;

  const selectedTopic = final?.structured
    ? String((final.structured as { selectedTopic?: string }).selectedTopic ?? "")
    : "";

  if (!latestRun || (!final?.text && !final?.structured)) {
    return <EmptyState title={t("empty")} description={t("emptyHint")} />;
  }

  return (
    <div className="space-y-3">
      {selectedTopic && (
        <Badge variant="secondary" className="max-w-full whitespace-normal break-all">
          {selectedTopic}
        </Badge>
      )}
      <MarkdownText content={(final?.text || "") as string} />
    </div>
  );
}

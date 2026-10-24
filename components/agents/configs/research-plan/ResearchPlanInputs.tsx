/**
 * ResearchPlan Inputs (components/agents/configs/research-plan/ResearchPlanInputs.tsx)
 *
 * Functionality:
 * - Declares the workflow-level inputs: research goal, discipline, keywords.
 *
 * @author mrpi
 * @date 2026-10-23
 */

"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { InputProps } from "../../agent-page-template";

/** Workflow inputs wired to the AgentPageTemplate field state. */
export function ResearchPlanInputs({ fieldState, setField }: InputProps) {
  const t = useTranslations("researchPlan.inputs");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="researchGoal">{t("researchGoal")}</Label>
        <Textarea
          id="researchGoal"
          rows={4}
          value={fieldState.researchGoal ?? ""}
          onChange={(e) => setField("researchGoal", e.target.value)}
          placeholder={t("researchGoalPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="discipline">{t("discipline")}</Label>
        <Input
          id="discipline"
          value={fieldState.discipline ?? ""}
          onChange={(e) => setField("discipline", e.target.value)}
          placeholder={t("disciplinePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="keywords">{t("keywords")}</Label>
        <Input
          id="keywords"
          value={fieldState.keywords ?? ""}
          onChange={(e) => setField("keywords", e.target.value)}
          placeholder={t("keywordsPlaceholder")}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}

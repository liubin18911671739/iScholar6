/**
 * LitReview Inputs (components/agents/configs/litreview/LitReviewInputs.tsx)
 *
 * Functionality:
 * - Renders search terms, year range, and max-results inputs for the literature-review agent.
 * - Auto-fills the query from the latest topic agent run and marks the field as auto-filled.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLatestAgentRun } from "@/lib/local/hooks";
import type { InputProps } from "../../agent-page-template";

/** Input form for the literature-review agent with topic auto-fill. */
export function LitReviewInputs({ fieldState, setField, projectId }: InputProps) {
  const t = useTranslations("agentConfig");
  const latestTopicRun = useLatestAgentRun(projectId, "topic");
  const [autoFilled, setAutoFilled] = useState(false);

  // Seeds the query from the previous topic run's keywords exactly once.
  useEffect(() => {
    if (autoFilled || fieldState.query) return;
    const inputs = latestTopicRun?.inputs as Record<string, unknown> | undefined;
    if (inputs?.keywords) {
      const kw = Array.isArray(inputs.keywords)
        ? inputs.keywords.join(", ")
        : String(inputs.keywords);
      if (kw) {
        setField("query", kw);
        setAutoFilled(true);
      }
    }
  }, [latestTopicRun, fieldState.query, autoFilled, setField]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("searchTerms")}</Label>
        <Input
          value={fieldState.query ?? ""}
          onChange={(e) => setField("query", e.target.value)}
          placeholder={t("searchTermsPlaceholder")}
        />
        {autoFilled && fieldState.query && (
          <p className="text-[10px] text-muted-foreground">{t("autoFilledFromTopic")}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>{t("yearRange")}</Label>
        <div className="flex items-center gap-2">
          <Input
            value={fieldState.yearFrom ?? ""}
            onChange={(e) => setField("yearFrom", e.target.value)}
            placeholder={t("yearStart")}
          />
          <span className="text-muted-foreground">{t("yearTo")}</span>
          <Input
            value={fieldState.yearTo ?? ""}
            onChange={(e) => setField("yearTo", e.target.value)}
            placeholder={t("yearEnd")}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("maxResults")}</Label>
        <Input
          value={fieldState.maxResults ?? "50"}
          onChange={(e) => setField("maxResults", e.target.value)}
          placeholder="50"
        />
      </div>
    </div>
  );
}

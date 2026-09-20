/**
 * Topic Inputs (components/agents/configs/topic/TopicInputs.tsx)
 *
 * Functionality:
 * - Renders discipline, keywords, and target-journal inputs for the topic agent.
 * - Shows the five most recent topic runs and restores their inputs into the form on click.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLocalAgentRuns } from "@/lib/local/hooks";
import type { InputProps } from "../../agent-page-template";

/** Input form for the topic-selection agent with draft history restore. */
export function TopicInputs({ fieldState, setField, projectId }: InputProps) {
  const t = useTranslations("agentConfig");
  const [showHistory, setShowHistory] = useState(false);
  const { data: topicRuns } = useLocalAgentRuns(projectId);

  // Five most recent topic runs that carry inputs.
  const topicHistory = (topicRuns ?? [])
    .filter((r) => r.agent === "topic" && r.inputs)
    .slice(0, 5);

  // Copies a past run's saved inputs back into the current form fields.
  function restoreFromHistory(run: (typeof topicHistory)[number]) {
    if (!run.inputs) return;
    const ri = run.inputs as Record<string, unknown>;
    if (typeof ri.discipline === "string") setField("discipline", ri.discipline);
    if (typeof ri.keywords === "string") setField("keywords", ri.keywords);
    else if (Array.isArray(ri.keywords)) setField("keywords", ri.keywords.join(", "));
    if (typeof ri.targetJournal === "string") setField("targetJournal", ri.targetJournal);
    setShowHistory(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("discipline")}</Label>
        <Input
          value={fieldState.discipline ?? ""}
          onChange={(e) => setField("discipline", e.target.value)}
          placeholder={t("disciplinePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("keywords")}</Label>
        <Input
          value={fieldState.keywords ?? ""}
          onChange={(e) => setField("keywords", e.target.value)}
          placeholder={t("keywordsPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("targetJournal")}</Label>
        <Input
          value={fieldState.targetJournal ?? ""}
          onChange={(e) => setField("targetJournal", e.target.value)}
          placeholder={t("targetJournalPlaceholder")}
        />
      </div>

      {topicHistory.length > 0 && (
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setShowHistory(!showHistory)}
          >
            {t("draftHistory")} ({topicHistory.length})
          </Button>
          {showHistory && (
            <div className="space-y-1 rounded-md border border-border/60 bg-card/50 p-2">
              {topicHistory.map((run) => {
                const ri = run.inputs as Record<string, unknown> | undefined;
                const label = (typeof ri?.discipline === "string" ? ri.discipline + " · " : "") +
                  (typeof ri?.keywords === "string" ? ri.keywords : Array.isArray(ri?.keywords) ? ri.keywords.join(", ") : "");
                return (
                  <button
                    key={run.id}
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent transition-colors"
                    onClick={() => restoreFromHistory(run)}
                  >
                    <span className="text-muted-foreground">
                      {new Date(run.startedAt).toLocaleDateString()}
                    </span>
                    {label && <span className="ml-2 truncate block text-[11px]">{label}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * StepRenderer (components/training/steps/step-renderer.tsx)
 *
 * Functionality:
 * - Renders a single typed training step, choosing between a comparison table and a textarea based on `step.type`.
 * - Resolves task/step scaffolding (title, prompt, placeholder, example) from i18n with registry fallbacks.
 * - Computes step completeness and optional final-question checks, and shows a toggleable example.
 *
 * Notes:
 * - Delegates comparison tables to `CompareTableStep`; uses `step-types`, `submit-checklist`, and final-question checks.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompareTableStep } from "./compare-table-step";
import {
  isCompareTableComplete,
  type TypedStepDef,
} from "@/lib/training/step-types";
import { isStepComplete } from "@/lib/training/submit-checklist";
import {
  checkFinalResearchQuestion,
} from "@/lib/training/final-question-checks";
import { cn } from "@/lib/utils";

/** Props for {@link StepRenderer}. */
type Props = {
  taskId: string;
  step: TypedStepDef;
  stepIndex: number;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

/** Resolve localized scaffold text for a task step, falling back to registry defaults. */
function useScaffold(taskId: string, stepIndex: number, fallbackTitle: string) {
  const tTasks = useTranslations("training.tasks");
  const tLearner = useTranslations("training.learner");

  const pick = (field: "title" | "prompt" | "placeholder" | "example", fallback: string) => {
    const key = `${taskId}.steps.${stepIndex}.${field}`;
    try {
      if (typeof tTasks.has === "function" && !tTasks.has(key as never)) {
        return fallback;
      }
      const value = tTasks(key as never);
      if (!value || value === key) return fallback;
      return value;
    } catch {
      return fallback;
    }
  };

  return {
    title: pick("title", fallbackTitle),
    prompt: pick("prompt", ""),
    placeholder: pick("placeholder", tLearner("answerPlaceholder")),
    example: pick("example", ""),
  };
}

/** Renders one typed training step with completeness and optional final checks. */
export function StepRenderer({
  taskId,
  step,
  stepIndex,
  value,
  onChange,
  disabled,
}: Props) {
  const t = useTranslations("training.learner");
  const [showExample, setShowExample] = useState(false);
  const scaffold = useScaffold(taskId, stepIndex, step.title);

  // Determine step completeness differently for comparison tables.
  const complete =
    step.type === "compare_table"
      ? isCompareTableComplete(value, step.rows ?? 3)
      : isStepComplete(value, step.minChars ?? 1);

  // Run final-question checks for enabled final-statement steps.
  const finalChecks =
    step.type === "final_statement" && step.enableFinalChecks
      ? checkFinalResearchQuestion(value)
      : null;

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            {complete ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span>
              {stepIndex + 1}. {scaffold.title}
            </span>
            <Badge variant={complete ? "secondary" : "outline"} className="text-[10px]">
              {complete ? t("stepDone") : t("stepTodo")}
            </Badge>
          </label>
          {scaffold.prompt ? (
            <p className="text-xs text-muted-foreground pl-6">{scaffold.prompt}</p>
          ) : null}
        </div>
        {scaffold.example ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => setShowExample((v) => !v)}
          >
            {showExample ? t("hideExample") : t("showExample")}
          </Button>
        ) : null}
      </div>

      {showExample && scaffold.example ? (
        <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs text-muted-foreground">
          {scaffold.example}
        </pre>
      ) : null}

      {step.type === "compare_table" ? (
        <CompareTableStep
          value={value}
          onChange={onChange}
          disabled={disabled}
          rows={step.rows ?? 3}
          labels={{
            candidate: "候选 / Candidate",
            novelty: "新颖性",
            value: "价值",
            feasibility: "可行性",
            decision: "取舍",
            keep: "保留",
            drop: "放弃",
          }}
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={scaffold.placeholder}
          disabled={disabled}
          className={cn(step.type === "diff_note" && "border-amber-500/30")}
          rows={step.type === "final_statement" ? 3 : 4}
        />
      )}

      {finalChecks ? (
        <div className="space-y-1 rounded border border-dashed p-2">
          <p className="text-xs font-medium">{t("finalCheckTitle")}</p>
          <ul className="space-y-0.5 text-xs">
            {finalChecks.map((c) => (
              <li
                key={c.id}
                className={c.ok ? "text-emerald-500" : "text-muted-foreground"}
              >
                {c.ok ? "✓" : "○"} {t(`finalCheck.${c.messageKey}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.type === "evidence_bind" ? (
        <p className="text-xs text-muted-foreground">
          {/* P3 soft: evidence cards live in panel below; this step holds binding notes */}
          DOI / 题名 / 原文位置可写在此步；证据卡在下方面板添加。
        </p>
      ) : null}
    </div>
  );
}

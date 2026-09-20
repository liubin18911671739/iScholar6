/**
 * Workflow Stepper (components/module/workflow-stepper.tsx)
 *
 * Functionality:
 * - Renders the horizontal 8-stage research workflow stepper linking to each stage's project route.
 * - Styles each node as current, production-complete, training-complete, or future based on the passed sets.
 * - Shows tooltips and check marks for completed stages and a visually hidden workflow label for screen readers.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES } from "./stages";

/** Props for the workflow stepper, including current and completed stage state. */
interface WorkflowStepperProps {
  projectId: string;
  /** 1-based id of the active stage */
  currentStage: number;
  /** Set of agent IDs that have approved/applied runs — data-driven completion */
  completedAgents?: Set<string>;
  /** Agents with completed training-camp tasks (coach path) — dashed check. */
  trainingCompletedAgents?: Set<string>;
}

/** Horizontal stepper visualizing progress through the research workflow. */
export function WorkflowStepper({
  projectId,
  currentStage,
  completedAgents,
  trainingCompletedAgents,
}: WorkflowStepperProps) {
  const t = useTranslations("module");

  return (
    <div className="workflow-stepper stepper relative z-10 shrink-0 border-b border-border/60 bg-card/30 px-4 py-3 backdrop-blur-sm">
      <div className="no-scrollbar mx-auto flex max-w-[1400px] items-center gap-0 overflow-x-auto">
        {STAGES.map((stage, i) => {
          // Derive completion/current/future state used to style each node.
          const isDone = completedAgents?.has(stage.agentId) ?? false;
          const isTrainingDone =
            !isDone && (trainingCompletedAgents?.has(stage.agentId) ?? false);
          const isCurrent = stage.id === currentStage;
          const isFuture = stage.id > currentStage && !isDone && !isTrainingDone;
          const href = `/projects/${projectId}/${stage.agentId}`;

          return (
            <div key={stage.id} className="flex shrink-0 items-center">
              <Link
                href={href}
                className="group flex flex-col items-center gap-1.5 px-1.5 outline-none"
                title={
                  isTrainingDone
                    ? t("trainingStageDone")
                    : isDone
                      ? t("productionStageDone")
                      : undefined
                }
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-all",
                    isCurrent &&
                      cn(
                        stage.accent.nodeBg,
                        "scale-110 border-transparent",
                        stage.accent.glow
                      ),
                    isDone &&
                      "border-transparent bg-primary/20 text-primary",
                    isTrainingDone &&
                      "border-dashed border-primary/50 bg-primary/10 text-primary",
                    isFuture &&
                      "border-border/70 bg-transparent text-muted-foreground/60 group-hover:text-muted-foreground"
                  )}
                >
                  {isDone || isTrainingDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    stage.id
                  )}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[10px] transition-colors",
                    isCurrent
                      ? cn(stage.accent.text, "font-semibold")
                      : isDone || isTrainingDone
                      ? "text-foreground/80"
                      : "text-muted-foreground/50"
                  )}
                >
                  {stage.label}
                </span>
              </Link>

              {/* Connector */}
              {i < STAGES.length - 1 && (
                <span
                  className={cn(
                    "mx-0.5 h-px w-6 sm:w-10 transition-colors",
                    stage.id < currentStage ? "bg-primary/50" : "bg-border/60"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="sr-only">{t("workflow")}</p>
    </div>
  );
}

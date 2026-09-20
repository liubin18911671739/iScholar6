/**
 * Module Workspace (components/module/module-workspace.tsx)
 *
 * Functionality:
 * - Assembles the shared module page shell: top bar, workflow stepper, status/action bar, content area, and side buttons.
 * - Renders either the provided custom `moduleContent` or the default inputs/preview/outputs card grid.
 * - Derives accent theming and stage info from the agent, and computes workflow progress from local hooks.
 * - Fetches training submissions to mark stepper nodes completed via training, and hosts the manual and assistant sheets.
 *
 * Notes:
 * - Orchestrates ModuleTopBar, WorkflowStepper, FlowBreadcrumb, AiDisclaimer, UserManual, ModuleCard, SideButtons, and ModuleAssistant.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { ReactNode, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  PlayCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CheckSquare,
  Sliders,
  Eye,
  Archive,
} from "lucide-react";
import type { AgentId } from "@/lib/ai/agents/registry";
import { isBuiltInAgent } from "@/lib/ai/agents/registry";
import { useWorkflowProgress } from "@/lib/local/hooks";
import { getStage, primaryStageForAgent, STAGES } from "./stages";
import { ModuleTopBar } from "./module-top-bar";
import { WorkflowStepper } from "./workflow-stepper";
import { FlowBreadcrumb } from "./flow-breadcrumb";
import { AiDisclaimer } from "./ai-disclaimer";
import { UserManual } from "./user-manual";
import { ModuleCard } from "./module-card";
import { SideButtons } from "./side-buttons";
import { ModuleAssistant } from "./module-assistant";

/** Lifecycle status of an agent run within the workspace. */
export type AgentStatus =
  | "idle"
  | "running"
  | "needs_review"
  | "approved"
  | "applied"
  | "failed";

/** Props for the module workspace shell and its run lifecycle callbacks. */
interface ModuleWorkspaceProps {
  agentId: AgentId;
  projectId: string;
  status: AgentStatus;
  progress?: number;
  errorMessage?: string | null;
  inputs: ReactNode;
  workspace: ReactNode;
  outputs: ReactNode;
  onRun?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRerun?: () => void;
  onApply?: () => void;
  /** Custom module content layout. When provided, replaces default 2-col card grid. */
  moduleContent?: ReactNode;
  /** Sub-feature tabs and state (Phase 3B) */
  subFeatureTabs?: ReactNode;
}

// Badge styling keyed by agent status.
const STATUS_STYLE: Record<AgentStatus, string> = {
  idle: "bg-muted/40 text-muted-foreground border-border",
  running: "bg-blue-500/15 text-blue-200 border-blue-400/30",
  needs_review: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  approved: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  applied: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  failed: "bg-red-500/15 text-red-200 border-red-400/30",
};

/** Default 2-col card grid layout (used when no moduleContent provided). */
function DefaultModuleContent({
  agentId,
  inputs,
  workspace,
  outputs,
  accent,
}: {
  agentId: AgentId;
  inputs: ReactNode;
  workspace: ReactNode;
  outputs: ReactNode;
  accent: { text: string };
}) {
  const tModule = useTranslations("module");
  const currentStage = primaryStageForAgent(agentId);
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-4 pb-8 sm:px-6">
      {currentStage > 0 && <FlowBreadcrumb currentStage={currentStage} />}
      <AiDisclaimer agentId={agentId} />
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <ModuleCard
            title={tModule("cardInput")}
            subtitle={tModule("cardInputHint")}
            icon={<Sliders className="h-4 w-4" />}
            accent={accent.text}
          >
            {inputs}
          </ModuleCard>
          <ModuleCard
            title={tModule("cardPreview")}
            subtitle={tModule("cardPreviewHint")}
            icon={<Eye className="h-4 w-4" />}
            accent={accent.text}
            bodyClassName="min-h-[220px]"
          >
            {workspace}
          </ModuleCard>
        </div>
        <ModuleCard
          title={tModule("cardSaved")}
          subtitle={tModule("cardSavedHint")}
          icon={<Archive className="h-4 w-4" />}
          accent={accent.text}
        >
          {outputs}
        </ModuleCard>
      </div>
    </div>
  );
}

/** Shared module page shell coordinating the header, stepper, actions, and content. */
export function ModuleWorkspace({
  agentId,
  projectId,
  status,
  progress = 0,
  errorMessage,
  inputs,
  workspace,
  outputs,
  onRun,
  onApprove,
  onReject,
  onRerun,
  onApply,
  moduleContent,
  subFeatureTabs,
}: ModuleWorkspaceProps) {
  const t = useTranslations("agents");
  const tModule = useTranslations("module");
  const tCommon = useTranslations("common");
  const currentStage = primaryStageForAgent(agentId);
  const stage = getStage(currentStage) ?? STAGES[0];
  const accent = stage.accent;
  const completedAgents = useWorkflowProgress(projectId);
  const [trainingCompletedAgents, setTrainingCompletedAgents] = useState<Set<string>>(
    () => new Set()
  );
  const isPluginAgent = !isBuiltInAgent(agentId);

  // Load training submissions to mark stepper nodes completed via training.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/training/me?include=all`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const submissions = (json.submissions ?? []) as Array<{
          task_id: string;
          status: string;
          training_reviews?: Array<{ decision: string }>;
        }>;
        const { agentsCompletedByTraining } = await import("@/lib/training/task-catalog");
        const statuses = submissions.map((s) => {
          const decision = s.training_reviews?.[0]?.decision;
          let status = s.status;
          if (decision === "approved" || s.status === "completed") status = "approved";
          return { taskId: s.task_id, status };
        });
        if (!cancelled) {
          setTrainingCompletedAgents(agentsCompletedByTraining({ taskStatuses: statuses }));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Sheet states for side buttons
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const [chatSheetOpen, setChatSheetOpen] = useState(false);

  const statusKey = status === "needs_review" ? "needsReview" : status;
  const statusLabel = t(
    `status.${statusKey}` as
      | "status.idle"
      | "status.running"
      | "status.needsReview"
      | "status.approved"
      | "status.applied"
      | "status.failed"
  );

  const actionLabel = isPluginAgent
    ? tCommon("run")
    : tModule(`action.${agentId}` as "action.topic");

  return (
    <div className="cosmic-bg relative flex h-full flex-col overflow-hidden text-foreground">
      <ModuleTopBar agentId={agentId} projectId={projectId} running={status === "running"} />
      {currentStage > 0 && (
        <WorkflowStepper
          projectId={projectId}
          currentStage={currentStage}
          completedAgents={completedAgents}
          trainingCompletedAgents={trainingCompletedAgents}
        />
      )}

      {/* Status + primary action bar — always visible */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={cn("gap-1.5 border px-2.5 py-1 text-xs", STATUS_STYLE[status])}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusLabel}
          </Badge>
          {status === "running" && (
            <Progress value={progress} className="h-1.5 w-40" />
          )}
          {status === "failed" && errorMessage && (
            <span className="max-w-[min(60vw,520px)] truncate text-xs text-red-300" title={errorMessage}>
              {errorMessage}
            </span>
          )}
        </div>

        {/* Sub-feature tabs (Phase 3B) */}
        {subFeatureTabs}

        <div className="flex items-center gap-2">
          {status === "idle" && onRun && (
            <Button
              onClick={onRun}
              className={cn("gap-1.5", accent.nodeBg, "border-transparent hover:opacity-90")}
            >
              <PlayCircle className="h-4 w-4" />
              {actionLabel}
            </Button>
          )}
          {status === "running" && (
            <Button disabled className="gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tCommon("running")}
            </Button>
          )}
          {status === "needs_review" && (
            <div className="flex gap-2">
              <Button onClick={onApprove} size="sm" className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tCommon("approve")}
              </Button>
              <Button onClick={onReject} variant="destructive" size="sm" className="gap-1.5">
                <XCircle className="h-3.5 w-3.5" />
                {tCommon("reject")}
              </Button>
            </div>
          )}
          {status === "approved" && (
            <div className="flex gap-2">
              {onApply && (
                <Button onClick={onApply} size="sm" className={cn("gap-1.5", accent.nodeBg, "border-transparent hover:opacity-90")}>
                  <CheckSquare className="h-3.5 w-3.5" />
                  {tCommon("applyToManuscript")}
                </Button>
              )}
              {onRerun && (
                <Button onClick={onRerun} variant="outline" size="sm" className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {tCommon("rerun")}
                </Button>
              )}
            </div>
          )}
          {status === "applied" && onRerun && (
            <Button onClick={onRerun} variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              {tCommon("rerun")}
            </Button>
          )}
          {status === "failed" && onRerun && (
            <Button onClick={onRerun} variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              {tCommon("rerun")}
            </Button>
          )}
        </div>
      </div>

      {/* Content area: custom module layout or default card grid */}
      <div
        className={cn(
          "relative z-10 h-full min-h-0 flex-1",
          moduleContent ? "overflow-hidden" : "overflow-y-auto"
        )}
      >
        {moduleContent ?? (
          <DefaultModuleContent
            agentId={agentId}
            inputs={inputs}
            workspace={workspace}
            outputs={outputs}
            accent={accent}
          />
        )}
      </div>

      {/* Fixed side buttons */}
      <SideButtons
        manualOpen={manualSheetOpen}
        chatOpen={chatSheetOpen}
        onToggleManual={() => setManualSheetOpen((v) => !v)}
        onToggleChat={() => setChatSheetOpen((v) => !v)}
      />

      {/* Help / UserManual Sheet */}
      <Sheet open={manualSheetOpen} onOpenChange={setManualSheetOpen}>
        <SheetContent side="right" className="flex w-[380px] flex-col p-0 sm:w-[420px]">
          <SheetHeader className="border-b border-border/50 px-4 py-3">
            <SheetTitle className="text-sm font-semibold">
              {tModule("manualTitle")}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <UserManual agentId={agentId} showCollapse={false} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Module Assistant Chat Sheet */}
      <ModuleAssistant
        open={chatSheetOpen}
        onOpenChange={setChatSheetOpen}
        agentId={agentId}
      />
    </div>
  );
}

/**
 * Agent Workspace (components/agents/agent-workspace.tsx)
 *
 * Functionality:
 * - Presentational 3-column agent layout (inputs, workspace, outputs) with a responsive tab fallback on small screens.
 * - Renders the status badge, run progress bar, and the run/approve/reject/rerun/apply action buttons.
 *
 * Notes:
 * - Stateless; all statuses and callbacks are supplied by the caller (AgentPageTemplate/ModuleWorkspace).
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayCircle, Loader2, CheckCircle2, XCircle, RotateCcw, CheckSquare } from "lucide-react";

/** Lifecycle status of an agent run. */
export type AgentStatus = "idle" | "running" | "needs_review" | "approved" | "applied" | "failed";

/** Props for the AgentWorkspace layout component. */
interface AgentWorkspaceProps {
  title: string;
  description: string;
  inputs: ReactNode;
  workspace: ReactNode;
  outputs: ReactNode;
  status: AgentStatus;
  progress?: number;
  onRun?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRerun?: () => void;
  onApply?: () => void;
}

// Maps each agent status to its badge color variant.
const STATUS_VARIANT: Record<AgentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  idle: "secondary",
  running: "default",
  needs_review: "outline",
  approved: "default",
  applied: "default",
  failed: "destructive",
};

/** Renders the agent header, action controls, and responsive inputs/workspace/outputs panels. */
export function AgentWorkspace({
  title,
  description,
  inputs,
  workspace,
  outputs,
  status,
  progress = 0,
  onRun,
  onApprove,
  onReject,
  onRerun,
  onApply,
}: AgentWorkspaceProps) {
  const t = useTranslations("agents");

  const statusKey = status === "needs_review" ? "needsReview" : status;
  const statusLabel = t(`status.${statusKey}` as "status.idle" | "status.running" | "status.needsReview" | "status.approved" | "status.applied" | "status.failed");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANT[status]}>
            {statusLabel}
          </Badge>
          {status === "idle" && onRun && (
            <Button onClick={onRun}>
              <PlayCircle className="mr-2 h-4 w-4" />
              {t("status.idle" === statusLabel ? "run" : "run")}
            </Button>
          )}
          {status === "running" && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("running")}
            </Button>
          )}
          {status === "needs_review" && (
            <div className="flex gap-2">
              <Button onClick={onApprove} size="sm">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {t("approve")}
              </Button>
              <Button onClick={onReject} variant="destructive" size="sm">
                <XCircle className="mr-1 h-3.5 w-3.5" />
                {t("reject")}
              </Button>
            </div>
          )}
          {status === "approved" && (
            <div className="flex gap-2">
              {onApply && (
                <Button onClick={onApply} size="sm">
                  <CheckSquare className="mr-1 h-3.5 w-3.5" />
                  {t("applyToManuscript")}
                </Button>
              )}
              {onRerun && (
                <Button onClick={onRerun} variant="outline" size="sm">
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {t("rerun")}
                </Button>
              )}
            </div>
          )}
          {status === "applied" && onRerun && (
            <Button onClick={onRerun} variant="outline" size="sm">
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              {t("rerun")}
            </Button>
          )}
          {status === "failed" && onRerun && (
            <Button onClick={onRerun} variant="outline" size="sm">
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              {t("rerun")}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {status === "running" && (
        <Progress value={progress} className="h-1.5" />
      )}

      {/* Desktop: 3-column grid */}
      <div className="hidden lg:grid gap-4 lg:grid-cols-[350px_1fr_380px]">
        <Card className="p-4 overflow-y-auto max-h-[calc(100vh-220px)]">
          {inputs}
        </Card>
        <Card className="p-4 overflow-y-auto max-h-[calc(100vh-220px)]">
          {workspace}
        </Card>
        <Card className="p-4 overflow-y-auto max-h-[calc(100vh-220px)]">
          {outputs}
        </Card>
      </div>

      {/* Mobile/Tablet: Tab-based layout */}
      <div className="lg:hidden">
        <Tabs defaultValue="workspace">
          <TabsList className="w-full">
            <TabsTrigger value="inputs" className="flex-1">
              {t("tabs.input")}
            </TabsTrigger>
            <TabsTrigger value="workspace" className="flex-1">
              {t("tabs.workspace")}
            </TabsTrigger>
            <TabsTrigger value="outputs" className="flex-1">
              {t("tabs.output")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inputs">
            <Card className="p-4 mt-2">{inputs}</Card>
          </TabsContent>
          <TabsContent value="workspace">
            <Card className="p-4 mt-2">{workspace}</Card>
          </TabsContent>
          <TabsContent value="outputs">
            <Card className="p-4 mt-2">{outputs}</Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

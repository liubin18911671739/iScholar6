/**
 * Tool Workspace (components/tools/tool-workspace.tsx)
 *
 * Functionality:
 * - Renders the standalone tool page shell with a back link, module title, status bar, and run action.
 * - Lays out provided inputs/preview in ModuleCards and renders arbitrary outputs below.
 * - Resolves the agent display name from the agent registry and localizes status/action labels.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  PlayCircle,
  Loader2,
  ArrowLeft,
  Eye,
  Sliders,
} from "lucide-react";
import Link from "next/link";
import type { AgentId } from "@/lib/ai/agents/registry";
import { AGENT_META, isValidAgent } from "@/lib/ai/agents/registry";
import { ModuleCard } from "@/components/module/module-card";

/** Lifecycle status of a standalone tool run. */
export type AgentStatus =
  | "idle"
  | "running"
  | "needs_review"
  | "approved"
  | "applied"
  | "failed";

/** Props for the standalone tool workspace shell. */
interface ToolWorkspaceProps {
  agentId: AgentId;
  status: AgentStatus;
  progress?: number;
  inputs: ReactNode;
  workspace: ReactNode;
  outputs: ReactNode;
  onRun?: () => void;
}

// Badge styling keyed by tool run status.
const STATUS_STYLE: Record<AgentStatus, string> = {
  idle: "bg-muted/40 text-muted-foreground border-border",
  running: "bg-blue-500/15 text-blue-200 border-blue-400/30",
  needs_review: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  approved: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  applied: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  failed: "bg-red-500/15 text-red-200 border-red-400/30",
};

/** Standalone tool page shell with header, status bar, and card-based content. */
export function ToolWorkspace({
  agentId,
  status,
  progress = 0,
  inputs,
  workspace,
  outputs,
  onRun,
}: ToolWorkspaceProps) {
  const t = useTranslations("agents");
  const tModule = useTranslations("module");
  const tTools = useTranslations("tools");
  const tCommon = useTranslations("common");

  const agentMeta = isValidAgent(agentId) ? AGENT_META[agentId] : undefined;
  const agentName = agentMeta?.name ?? agentId;

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

  const actionLabel = tModule(`action.${agentId}` as "action.topic");

  return (
    <div className="cosmic-bg relative flex h-full flex-col overflow-hidden text-foreground">
      {/* Simple header */}
      <header className="flex h-14 items-center gap-3 border-b border-border/50 bg-card/60 backdrop-blur-md px-4">
        <Link
          href="/tools"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {tTools("backToTools")}
        </Link>
        <div className="h-4 w-px bg-border" />
        <span className="text-sm font-medium">{agentName}</span>
        <span className="text-[10px] text-muted-foreground">· 学伴智枢</span>
        <div className="flex-1" />
        <span className="text-[10px] text-amber-300/80">{tTools("sessionNote")}</span>
      </header>

      {/* Status bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={cn("gap-1.5 border px-2.5 py-1 text-xs", STATUS_STYLE[status])}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusLabel}
          </Badge>
          {status === "running" && (
            <Progress value={progress} className="h-1.5 w-40" />
          )}
        </div>

        {status === "idle" && onRun && (
          <Button onClick={onRun} className="gap-1.5 bg-blue-500 text-white hover:bg-blue-600 border-transparent">
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
      </div>

      {/* Content */}
      <div className="relative z-10 h-full min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-[1200px] space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ModuleCard
              title={tModule("cardInput")}
              subtitle={tModule("cardInputHint")}
              icon={<Sliders className="h-4 w-4" />}
              accent="text-blue-300"
            >
              {inputs}
            </ModuleCard>
            <ModuleCard
              title={tModule("cardPreview")}
              subtitle={tModule("cardPreviewHint")}
              icon={<Eye className="h-4 w-4" />}
              accent="text-blue-300"
              bodyClassName="min-h-[220px]"
            >
              {workspace}
            </ModuleCard>
          </div>
          {outputs}
        </div>
      </div>
    </div>
  );
}

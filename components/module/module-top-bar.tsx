/**
 * Module Top Bar (components/module/module-top-bar.tsx)
 *
 * Functionality:
 * - Renders the per-module header with a back link, module title, save-status badge, project selector, and refresh button.
 * - Honors a safe `returnTo` training deep link when present, otherwise links back to the projects list.
 * - Loads local projects from Dexie to populate the project switcher and highlight the active project.
 *
 * Notes:
 * - Uses `sanitizeTrainingReturnTo` to guard the return target and the agent registry/stages helpers for theming.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { ArrowLeft, RefreshCw, Check, ChevronDown, Sparkles } from "lucide-react";
import { sanitizeTrainingReturnTo } from "@/lib/training/safe-return";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localDB } from "@/lib/local/db";
import { cn } from "@/lib/utils";
import type { AgentId } from "@/lib/ai/agents/registry";
import { getAgentMeta } from "@/lib/ai/agents/registry";
import { moduleNameForAgent, getStage, primaryStageForAgent, STAGES } from "./stages";

/** Props for the module header bar. */
interface ModuleTopBarProps {
  agentId: AgentId;
  projectId: string;
  running?: boolean;
}

/** Header bar for a module page with navigation, save status, and project switching. */
export function ModuleTopBar({ agentId, projectId, running }: ModuleTopBarProps) {
  const t = useTranslations("module");
  const tTraining = useTranslations("training.learner");
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeTrainingReturnTo(searchParams.get("returnTo"));

  const stage = getStage(primaryStageForAgent(agentId)) ?? STAGES[0];
  const moduleName = getAgentMeta(agentId)?.name ?? moduleNameForAgent(agentId);

  const projectsRaw = useLiveQuery(
    () => localDB.projects.orderBy("updatedAt").reverse().toArray(),
    []
  );
  const projects = Array.isArray(projectsRaw) ? projectsRaw : [];
  const active = projects.find((p) => p.id === projectId);
  const activeProjects = projects.filter((p) => p.status !== "archived");

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-card/60 px-4 backdrop-blur-md">
      {/* Back — prefer training return when opened from coach deep link */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <Link href={returnTo ?? "/projects"}>
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">
            {returnTo ? tTraining("returnToTraining") : "iScholar"}
          </span>
          <span className="text-[11px] opacity-70">{t("back")}</span>
        </Link>
      </Button>

      <div className="h-5 w-px bg-border/70" />

      {/* Module title + brand */}
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className={cn("h-4 w-4 shrink-0", stage.accent.text)} />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h1 className="truncate text-sm font-semibold">{moduleName}</h1>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            · {t("brand")}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Saved status */}
        <Badge
          variant="outline"
          className={cn(
            "gap-1 border-transparent text-[11px] font-normal",
            running
              ? "bg-amber-500/15 text-amber-200"
              : "bg-emerald-500/15 text-emerald-200"
          )}
        >
          {running ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {running ? t("saving") : t("saved")}
        </Badge>

        {/* Project selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
              <span className="max-w-[120px] truncate text-xs">
                {active?.name ?? t("unnamedProject")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {activeProjects.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("noProjects")}
              </div>
            )}
            {activeProjects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}/${agentId}`)}
                className={cn(
                  "text-xs",
                  p.id === projectId && "font-semibold"
                )}
              >
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("refresh")}
          onClick={() => router.refresh()}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

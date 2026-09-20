/**
 * Dashboard Page (/(app)/dashboard)
 *
 * Functionality:
 * - Client overview of projects, agent runs, and recent activity.
 * - Loads local (IndexedDB) data via local hooks and derives summary stats.
 * - Renders cost tracking charts, recent projects, and a getting-started panel.
 *
 * Notes:
 * - Collaborates with @/lib/local/hooks, cost-charts, and the agent registry.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderKanban, Activity, Clock, ArrowRight } from "lucide-react";
import { useLocalProjects, useLocalAllAgentRuns, useCostSummary } from "@/lib/local/hooks";
import { CostSummaryCards, CostByAgentChart, CostOverTimeChart } from "@/components/dashboard/cost-charts";
import { getAgentMeta } from "@/lib/ai/agents/registry";
import { RemoteLoadError, firstRemoteError } from "@/components/collaborative/remote-load-error";

/** Shared card styling used by every dashboard panel. */
const dashboardCardClass = "border-blue-400/20 bg-card/95 shadow-[0_12px_40px_-24px_rgba(15,98,254,0.65)]";

/** Dashboard page that summarizes local projects, runs, and costs. */
export default function DashboardPage() {
  const t = useTranslations("dashboard");
  // Load projects, agent runs, and cost summary from the local data layer.
  const { data: projects, error: projectsError, refetch: refetchProjects } = useLocalProjects();
  const { data: agentRuns, error: agentRunsError, refetch: refetchRuns } = useLocalAllAgentRuns();
  const costSummary = useCostSummary();
  // Surface the first remote load error so the banner can offer a combined retry.
  const remoteError = firstRemoteError(projectsError, agentRunsError);

  // Defensive: remote/local hooks must return arrays, but never crash the dashboard if not.
  const projectList = Array.isArray(projects) ? projects : [];
  const runList = Array.isArray(agentRuns) ? agentRuns : [];
  // Derive summary metrics from the loaded lists (archived projects excluded).
  const activeProjects = projectList.filter((p) => p.status !== "archived");
  const projectCount = activeProjects.length;
  const runCount = runList.length;
  const lastActivity = runList[0]?.startedAt;

  return (
    <div className="cosmic-bg -m-6 min-h-[calc(100vh-3.5rem)] space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("welcome")}</p>
        </div>
        <Button asChild>
          <Link href="/projects">
            <Plus className="mr-2 h-4 w-4" />
            {t("newProject")}
          </Link>
        </Button>
      </div>

      <RemoteLoadError
        error={remoteError}
        onRetry={() => {
          refetchProjects();
          refetchRuns();
        }}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={dashboardCardClass}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("projects")}
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectCount}</div>
            <p className="text-xs text-muted-foreground">
              {projectCount === 0 ? t("noProjects") : t("projectCount", { count: projectCount })}
            </p>
          </CardContent>
        </Card>
        <Card className={dashboardCardClass}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("agentRuns")}
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runCount}</div>
            <p className="text-xs text-muted-foreground">
              {runCount === 0 ? t("noRuns") : t("allProjects")}
            </p>
          </CardContent>
        </Card>
        <Card className={dashboardCardClass}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("recentActivity")}
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastActivity
                ? new Date(lastActivity).toLocaleDateString()
                : "--"}
            </div>
            <p className="text-xs text-muted-foreground">
              {lastActivity ? t("lastAgentRun") : t("startFirst")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Tracking */}
      <CostSummaryCards data={costSummary} />
      <div className="grid gap-4 md:grid-cols-2">
        <CostByAgentChart data={costSummary} />
        <CostOverTimeChart data={costSummary} />
      </div>

      {/* Recent Projects — quick actions */}
      {activeProjects.length > 0 && (
        <Card className={dashboardCardClass}>
          <CardHeader>
            <CardTitle>{t("recentProjects")}</CardTitle>
            <CardDescription>{t("projectCount", { count: activeProjects.length })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeProjects.slice(0, 5).map((project) => {
              // Find this project's most recent run to display last activity.
              const lastRun = runList
                .filter((r) => r.projectId === project.id)
                .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
              return (
                <div key={project.id} className="flex items-center justify-between rounded-lg border border-blue-400/20 bg-background/45 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lastRun
                        ? `${getAgentMeta(lastRun.agent)?.name ?? lastRun.agent} · ${new Date(lastRun.startedAt).toLocaleDateString()}`
                        : t("startFirst")}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="gap-1 shrink-0 text-blue-100 hover:bg-accent hover:text-accent-foreground">
                    <Link href={`/projects/${project.id}/topic`}>
                      {t("continueProject")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Getting Started */}
      <Card className={dashboardCardClass}>
        <CardHeader>
          <CardTitle>{t("quickStart")}</CardTitle>
          <CardDescription>
            {t("createAndUse")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-6 w-6 rounded-full border-blue-300/45 bg-blue-500/20 p-0 flex items-center justify-center text-xs text-blue-100">1</Badge>
              <span className="text-sm">{t("createProject")}</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-6 w-6 rounded-full border-blue-300/45 bg-blue-500/20 p-0 flex items-center justify-center text-xs text-blue-100">2</Badge>
              <span className="text-sm">{t("runTopicScout")}</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-6 w-6 rounded-full border-blue-300/45 bg-blue-500/20 p-0 flex items-center justify-center text-xs text-blue-100">3</Badge>
              <span className="text-sm">{t("workflow")}</span>
            </div>
          </div>
          <Button className="mt-4" asChild>
            <Link href="/projects">
              {t("createFirst")}
              <Plus className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

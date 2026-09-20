/**
 * TrainingAnalyticsDashboard (components/training/analytics-dashboard.tsx)
 *
 * Functionality:
 * - Renders the org-wide training analytics view: KPI cards, a cross-program bar chart, reviewer KPIs, and a risk heatmap.
 * - Fetches `/api/training/analytics/dashboard` for a user-selected date window and surfaces 403 as a forbidden state.
 * - Owns local state for the date range, loading/error flags, and the fetched dashboard payload.
 *
 * Notes:
 * - Charts use recharts; copy comes from the `training.analytics` next-intl namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";
import type { CrossProgramRow, ReviewerKpi, RiskHeatmap } from "@/lib/training/reporting-v2";

/** Shape of the `/api/training/analytics/dashboard` response payload. */
type DashboardPayload = {
  window: { from: string; to: string };
  programs: CrossProgramRow[];
  totals: {
    programs: number;
    members: number;
    pendingReviews: number;
    avgCompletionRate: number;
  };
  reviewerKpis: ReviewerKpi[];
  heatmap: RiskHeatmap | null;
};

/** Shared axis tick styling for the dashboard charts. */
const chartTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

/** Maps a risk score to a Tailwind background color class for heatmap cells. */
function heatColor(score: number): string {
  if (score >= 70) return "bg-red-500/70";
  if (score >= 40) return "bg-amber-500/50";
  if (score >= 15) return "bg-yellow-500/30";
  return "bg-muted/40";
}

/** Org-wide training analytics dashboard with KPIs, charts, and risk heatmap. */
export function TrainingAnalyticsDashboard() {
  const t = useTranslations("training.analytics");
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  // Fetch the dashboard payload for the selected window, distinguishing 403 from other errors.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/training/analytics/dashboard?${params}`);
      if (res.status === 403) {
        setForbidden(true);
        setData(null);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(String(json.error ?? "LOAD_FAILED"));
      }
      const json = await res.json();
      setData(json.data ?? null);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{t("forbidden")}</CardContent>
        </Card>
      </div>
    );
  }

  // Project per-program rows into the flat shape recharts expects.
  const chartData = (data?.programs ?? []).map((p) => ({
    name: p.name.slice(0, 12),
    completion: p.avgCompletionRate,
    pending: p.pendingReviews,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("from")}</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("to")}</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            {t("refresh")}
          </Button>
        </div>
      </div>

      <RemoteLoadError error={error || null} onRetry={() => void load()} />

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{t("kpi.programs")}</div>
                <div className="text-2xl font-semibold">{data.totals.programs}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{t("kpi.members")}</div>
                <div className="text-2xl font-semibold">{data.totals.members}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{t("kpi.pending")}</div>
                <div className="text-2xl font-semibold">{data.totals.pendingReviews}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{t("kpi.completion")}</div>
                <div className="text-2xl font-semibold">{data.totals.avgCompletionRate}%</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("crossTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={chartTick} />
                    <YAxis tick={chartTick} />
                    <Tooltip />
                    <Bar dataKey="completion" name={t("chart.completion")} fill="hsl(var(--primary))" />
                    <Bar dataKey="pending" name={t("chart.pending")} fill="hsl(var(--muted-foreground))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("reviewerTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.reviewerKpis ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("noReviewers")}</p>
              )}
              {(data.reviewerKpis ?? []).map((kpi) => (
                <div
                  key={kpi.reviewerId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
                >
                  <span className="font-mono text-xs">
                    {kpi.reviewerId.slice(0, 8)}…
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">
                      {t("reviewer.total", { count: kpi.reviewCount })}
                    </Badge>
                    <Badge variant="outline">
                      {t("reviewer.approved", { count: kpi.approved })}
                    </Badge>
                    <Badge variant="outline">
                      {t("reviewer.revision", { count: kpi.needsRevision })}
                    </Badge>
                    <Badge variant="destructive">
                      {t("reviewer.escalated", { count: kpi.escalated })}
                    </Badge>
                    {kpi.avgScore != null && (
                      <Badge variant="secondary">
                        {t("reviewer.avgScore", { score: kpi.avgScore })}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {data.heatmap && data.heatmap.cells.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("heatmapTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <p className="mb-2 text-xs text-muted-foreground">{t("heatmapHint")}</p>
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `120px repeat(${data.heatmap.taskIds.length}, minmax(48px, 1fr))`,
                  }}
                >
                  <div />
                  {data.heatmap.taskIds.map((tid) => (
                    <div key={tid} className="truncate text-[10px] text-muted-foreground" title={tid}>
                      {tid.slice(0, 8)}
                    </div>
                  ))}
                  {data.heatmap.learners.map((learner) => (
                    <div key={learner.learnerId} className="contents">
                      <div
                        className="truncate text-xs"
                        title={learner.displayName ?? learner.learnerId}
                      >
                        {learner.displayName || learner.learnerId.slice(0, 8)}
                      </div>
                      {data.heatmap!.taskIds.map((taskId) => {
                        const cell = data.heatmap!.cells.find(
                          (c) => c.learnerId === learner.learnerId && c.taskId === taskId
                        );
                        const score = cell?.score ?? 0;
                        return (
                          <div
                            key={`${learner.learnerId}-${taskId}`}
                            className={`h-8 rounded ${heatColor(score)}`}
                            title={
                              cell
                                ? `${score}: ${cell.reasons.join(", ")}`
                                : "0"
                            }
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

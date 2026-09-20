/**
 * ClassReportPanel (components/training/class-report-panel.tsx)
 *
 * Functionality:
 * - Loads and renders a single program's class report: summary stats, submission funnel, per-task rates, task table, and at-risk learners.
 * - Fetches `/api/training/programs/:programId/report` on mount and when `programId` changes, with a manual refresh button.
 * - Derives recharts-ready funnel and task-rate datasets from the fetched `ClassReport`.
 *
 * Notes:
 * - Uses recharts, the internal `Stat` card helper, and the `training.manage` i18n namespace.
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
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";
import type { ClassReport } from "@/lib/training/reporting";

/** Class report payload augmented with the owning program summary. */
type ReportPayload = ClassReport & {
  program?: { id: string; name: string; status?: string };
};

/** Shared axis tick styling for the report charts. */
const chartTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

/** Panel showing the aggregate class report for one training program. */
export function ClassReportPanel({ programId }: { programId: string }) {
  const t = useTranslations("training.manage");
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch the class report for the current program.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/training/programs/${programId}/report`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(String(json.error ?? "LOAD_FAILED"));
      }
      const json = await res.json();
      setReport(json.data ?? null);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : t("reportLoadError"));
    } finally {
      setLoading(false);
    }
  }, [programId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Assemble the ordered submission funnel stages for the chart.
  const funnelData = report
    ? [
        { key: "not_started", label: t("funnel.notStarted"), value: report.funnel.not_started },
        { key: "draft", label: t("funnel.draft"), value: report.funnel.draft },
        { key: "submitted", label: t("funnel.submitted"), value: report.funnel.submitted },
        { key: "needs_revision", label: t("funnel.needsRevision"), value: report.funnel.needs_revision },
        { key: "approved", label: t("funnel.approved"), value: report.funnel.approved },
        { key: "escalated", label: t("funnel.escalated"), value: report.funnel.escalated },
      ]
    : [];

  // Truncate long task titles for the task-rate chart axis labels.
  const taskChart = (report?.byTask ?? []).map((row) => ({
    name: row.title.length > 10 ? row.title.slice(0, 10) + "…" : row.title,
    fullName: row.title,
    submitRate: row.submitRate,
    approveRate: row.approveRate,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("reportTitle")}</h2>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {t("actions.refresh")}
        </Button>
      </div>

      <RemoteLoadError error={error || null} onRetry={() => void load()} />

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("report.activeMembers")} value={String(report.activeCount)} />
            <Stat label={t("report.avgCompletion")} value={`${report.avgCompletionRate}%`} />
            <Stat label={t("report.pendingReviews")} value={String(report.reviewLoad.pending)} />
            <Stat
              label={t("report.avgWait")}
              value={
                report.reviewLoad.avgWaitHours == null
                  ? "—"
                  : `${report.reviewLoad.avgWaitHours}h`
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("report.funnelTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={chartTick} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={chartTick} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("report.taskRatesTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={chartTick} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={chartTick} domain={[0, 100]} unit="%" />
                  <Tooltip
                    formatter={(value, name) => [
                      `${value ?? 0}%`,
                      name === "submitRate" ? t("report.submitRate") : t("report.approveRate"),
                    ]}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? ""
                    }
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="submitRate" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="approveRate" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("report.taskTableTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">{t("report.colTask")}</th>
                    <th className="py-2 pr-3">{t("report.submitRate")}</th>
                    <th className="py-2 pr-3">{t("report.approveRate")}</th>
                    <th className="py-2">{t("report.avgScore")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byTask.map((row) => (
                    <tr key={row.taskId} className="border-t border-border/50">
                      <td className="py-2 pr-3">{row.title}</td>
                      <td className="py-2 pr-3">{row.submitRate}%</td>
                      <td className="py-2 pr-3">{row.approveRate}%</td>
                      <td className="py-2">{row.avgScore ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("report.riskTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.risk.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("report.riskEmpty")}</p>
              )}
              {report.risk.map((row) => (
                <div
                  key={row.learnerId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
                >
                  <span>{row.displayName || row.learnerId.slice(0, 8) + "…"}</span>
                  <div className="flex gap-2">
                    {row.revisionCount >= 2 && (
                      <Badge variant="outline">
                        {t("report.revisions", { count: row.revisionCount })}
                      </Badge>
                    )}
                    {row.escalatedCount >= 1 && (
                      <Badge variant="destructive">
                        {t("report.escalations", { count: row.escalatedCount })}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** Compact labelled statistic card used in the report summary grid. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * TrainingReport (components/training/report.tsx)
 *
 * Functionality:
 * - Personal training report: dimension score cards, a radar chart, a task/status table, and recent feedback.
 * - Merges local report data with remote submissions/reviews when collaborative mode is active.
 * - Supports JSON export and print-to-PDF of the report.
 *
 * Notes:
 * - Uses recharts, training scoring/registry helpers, and the `training.report` i18n namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTrainingReportData } from "@/lib/local/hooks";
import { buildDimensionReport, TRAINING_DIMENSIONS } from "@/lib/training/scoring";
import { getCollaborativeAuthHeaders, isCollaborativeMode } from "@/lib/supabase/collaborative";
import { MVP_TRAINING_TASKS } from "@/lib/training/registry";

/** A remote review record with decision, feedback, and score. */
type RemoteReview = {
  decision: string;
  feedback?: string | null;
  score?: number | null;
  created_at: string;
};

/** A remote submission with its optional review timeline. */
type RemoteSubmission = {
  id: string;
  task_id: string;
  status: string;
  answers?: Record<string, string>;
  reflection?: string | null;
  latest_review?: RemoteReview | null;
  training_reviews?: RemoteReview[];
};

/** Personal training report with dimension scores, radar, table, and feedback. */
export function TrainingReport({ projectId }: { projectId: string }) {
  const t = useTranslations("training.report");
  const data = useTrainingReportData(projectId);
  const collaborative = isCollaborativeMode();
  const [remoteSubs, setRemoteSubs] = useState<RemoteSubmission[]>([]);

  // Fetch remote submissions/reviews when running in collaborative mode.
  useEffect(() => {
    if (!collaborative) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/training/me?include=all", {
          headers: await getCollaborativeAuthHeaders(),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setRemoteSubs(json.submissions ?? []);
      } catch {
        if (!cancelled) setRemoteSubs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collaborative]);

  // Aggregate local task/submission pairs into per-dimension scores.
  const report = useMemo(() => {
    if (!data) return undefined;
    return buildDimensionReport(
      data.map(({ task, submission }) => ({
        dimension: task.dimension,
        stepCount: task.steps.length,
        submission,
      }))
    );
  }, [data]);

  // Map dimension scores into radar chart points.
  const radarData = useMemo(
    () =>
      TRAINING_DIMENSIONS.map((dimension) => ({
        dimension: dimension.label,
        score: report?.[dimension.id] ?? 0,
      })),
    [report]
  );

  // Build task rows from remote reviews when available, otherwise from local data.
  const taskRows = useMemo(() => {
    if (collaborative && remoteSubs.length > 0) {
      return MVP_TRAINING_TASKS.map((task) => {
        const sub = remoteSubs.find((s) => s.task_id === task.id);
        const review = sub?.latest_review;
        return {
          taskId: task.id,
          title: task.title,
          status: sub?.status ?? "not_started",
          score: review?.score ?? null,
          decision: review?.decision ?? null,
          feedback: review?.feedback ?? null,
          feedbackAt: review?.created_at ?? null,
        };
      });
    }
    return (data ?? []).map(({ task, submission }) => ({
      taskId: task.id,
      title: task.title,
      status: submission?.status ?? "not_started",
      score: null as number | null,
      decision: null as string | null,
      feedback: null as string | null,
      feedbackAt: null as string | null,
    }));
  }, [collaborative, data, remoteSubs]);

  // Take the five most recent feedback entries by timestamp.
  const recentFeedback = taskRows
    .filter((row) => row.feedback)
    .slice()
    .sort((a, b) => {
      const ta = a.feedbackAt ? new Date(a.feedbackAt).getTime() : 0;
      const tb = b.feedbackAt ? new Date(b.feedbackAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 5);

  // Export the report payload as a JSON download.
  function downloadJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      projectId,
      dimensions: report ?? {},
      tasks: taskRows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-personal-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Trigger the browser print dialog for a PDF export.
  function printPdf() {
    window.print();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={downloadJson}>
            {t("exportJson")}
          </Button>
          <Button variant="outline" size="sm" onClick={printPdf}>
            {t("exportPdf")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {TRAINING_DIMENSIONS.map((dimension) => (
          <Card key={dimension.id}>
            <CardHeader>
              <CardTitle className="text-xs">{dimension.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {report?.[dimension.id] ?? 0}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("radarTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar
                name="score"
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.35}
              />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("taskTableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">{t("colTask")}</th>
                <th className="py-2 pr-3">{t("colStatus")}</th>
                <th className="py-2 pr-3">{t("colDecision")}</th>
                <th className="py-2">{t("colScore")}</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((row) => (
                <tr key={row.taskId} className="border-t border-border/50">
                  <td className="py-2 pr-3">{row.title}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="outline">{row.status}</Badge>
                  </td>
                  <td className="py-2 pr-3">{row.decision ?? "—"}</td>
                  <td className="py-2">{row.score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("feedbackTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentFeedback.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("feedbackEmpty")}</p>
          )}
          {recentFeedback.map((row) => (
            <div key={row.taskId + (row.feedbackAt ?? "")} className="rounded border p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{row.title}</span>
                {row.decision && <Badge variant="outline">{row.decision}</Badge>}
                {row.feedbackAt && <span>{new Date(row.feedbackAt).toLocaleString()}</span>}
              </div>
              <p className="whitespace-pre-wrap">{row.feedback}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardContent className="p-6 text-sm text-muted-foreground">{t("footnote")}</CardContent>
      </Card>
    </div>
  );
}

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
import { buildDimensionReport, TRAINING_DIMENSIONS } from "@/lib/training/scoring";
import type { LocalTrainingSubmission } from "@/lib/types/domain";
import { getMyTraining } from "@/lib/client/training";
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
  const [remoteSubs, setRemoteSubs] = useState<RemoteSubmission[]>([]);

  // Fetch the learner's submissions/reviews from the backend.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMyTraining("all");
        if (cancelled) return;
        const toReview = (r: { decision: string; feedback?: string | null; score?: number | null; createdAt: string }): RemoteReview => ({
          decision: r.decision,
          feedback: r.feedback ?? null,
          score: r.score ?? null,
          created_at: r.createdAt,
        });
        setRemoteSubs(
          (me.submissions ?? []).map((s) => ({
            id: s.id,
            task_id: s.taskId,
            status: s.status,
            answers: s.answers as Record<string, string> | undefined,
            reflection: s.reflection ?? null,
            latest_review: s.latestReview ? toReview(s.latestReview) : null,
            training_reviews: (s.reviews ?? []).map(toReview),
          }))
        );
      } catch {
        if (!cancelled) setRemoteSubs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Aggregate backend submissions into per-dimension scores.
  const report = useMemo(
    () =>
      buildDimensionReport(
        MVP_TRAINING_TASKS.map((task) => {
          const sub = remoteSubs.find((s) => s.task_id === task.id);
          const submission = sub
            ? ({
                id: sub.id,
                taskId: task.id,
                status: sub.status,
                answers: sub.answers ?? {},
                reflection: sub.reflection ?? undefined,
              } as unknown as LocalTrainingSubmission)
            : undefined;
          return { dimension: task.dimension, stepCount: task.steps.length, submission };
        })
      ),
    [remoteSubs]
  );

  // Map dimension scores into radar chart points.
  const radarData = useMemo(
    () =>
      TRAINING_DIMENSIONS.map((dimension) => ({
        dimension: dimension.label,
        score: report?.[dimension.id] ?? 0,
      })),
    [report]
  );

  // Build task rows from backend submissions/reviews.
  const taskRows = useMemo(
    () =>
      MVP_TRAINING_TASKS.map((task) => {
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
      }),
    [remoteSubs]
  );

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

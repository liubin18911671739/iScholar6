/**
 * MvpTraining (components/training/mvp-training.tsx)
 *
 * Functionality:
 * - Learner landing view for the MVP training camp: task-list sidebar with progress badges plus the selected task workspace.
 * - Loads the learner's remote enrollment, curriculum, and per-task progress, and backfills local task records when missing.
 * - Hosts the peer review queue when a remote enrollment exists and links out to each task detail page.
 *
 * Notes:
 * - Composes `CoachWorkspace` and `PeerReviewQueue`; task definitions come from `MVP_TRAINING_TASKS`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocalProjects } from "@/lib/local/hooks/projects";
import {
  useTrainingTasks,
  createTrainingTask,
} from "@/lib/local/hooks/training";
import { MVP_TRAINING_TASKS } from "@/lib/training/registry";
import { RemoteLoadError, firstRemoteError } from "@/components/collaborative/remote-load-error";
import { getCollaborativeAuthHeaders } from "@/lib/supabase/collaborative";
import { PeerReviewQueue } from "@/components/training/peer-queue";
import { CoachWorkspace } from "@/components/training/coach-workspace";


/** Fallback query result shape used when local hooks return nothing. */
const EMPTY_LIST_QUERY = {
  data: undefined as undefined,
  error: null as string | null,
  refetch: () => {},
};

/** Known task statuses that have localized labels. */
const TASK_STATUS_KEYS = new Set([
  "not_started",
  "in_progress",
  "submitted",
  "needs_review",
  "reviewed",
  "completed",
  "approved",
  "needs_revision",
  "escalated",
]);

/** Render a localized task status, appending an overdue marker when needed. */
function formatTaskStatus(
  t: (key: string) => string,
  status: string,
  overdue?: boolean
): string {
  const label = TASK_STATUS_KEYS.has(status) ? t(`status.${status}`) : status;
  if (overdue) return `${label} · ${t("status.overdue")}`;
  return label;
}

/** Minimal remote submission used for the sidebar status badge. */
type RemoteSubmission = {
  id: string;
  task_id: string;
  status: string;
};

/** Learner training-camp landing view with task list and task workspace. */
export function MvpTraining() {
  const t = useTranslations("training.learner");
  const projectsQuery = useLocalProjects() ?? EMPTY_LIST_QUERY;
  const { data: projectsData, error: projectsError, refetch: refetchProjects } =
    projectsQuery;
  const projects = Array.isArray(projectsData) ? projectsData : [];
  const projectId = projects[0]?.id ?? "";
  const tasksQuery = useTrainingTasks(projectId) ?? EMPTY_LIST_QUERY;
  const { data: tasks, error: tasksError, refetch: refetchTasks } = tasksQuery;
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [remoteEnrollment, setRemoteEnrollment] = useState<{
    program_id: string;
    training_programs?: { name: string; status?: string };
  } | null>(null);
  const [remoteEnrollmentError, setRemoteEnrollmentError] = useState("");
  const [remoteSubmissions, setRemoteSubmissions] = useState<RemoteSubmission[]>(
    []
  );
  const [curriculumTaskIds, setCurriculumTaskIds] = useState<string[] | null>(
    null
  );
  const [taskProgress, setTaskProgress] = useState<
    Record<string, { status: string; overdue: boolean }>
  >({});
  const [completionRate, setCompletionRate] = useState<number | null>(null);
  const collaborative = true;

  // Merge registry task definitions with stored status, filtered to the enrolled curriculum.
  const displayTasks = useMemo(() => {
    const all = MVP_TRAINING_TASKS.map((def) => {
      const stored = tasks?.find((t0) => t0.id === def.id);
      return {
        id: def.id,
        title: def.title,
        description: def.description,
        agent: def.agent,
        dimension: def.dimension,
        steps: def.steps,
        requiresReview: def.requiresReview,
        status: stored?.status ?? ("not_started" as const),
      };
    });
    if (!curriculumTaskIds || curriculumTaskIds.length === 0) return all;
    const filtered = all.filter((t0) => curriculumTaskIds.includes(t0.id));
    return filtered.length > 0 ? filtered : all;
  }, [tasks, curriculumTaskIds]);

  const selectedTask =
    displayTasks.find((task) => task.id === selectedTaskId) ??
    displayTasks[0] ??
    null;
  const effectiveTaskId = selectedTask?.id ?? "";

  const remoteDataError = firstRemoteError(projectsError, tasksError);

  // Load enrollment, curriculum, and progress, aborting the request after a timeout.
  useEffect(() => {
    if (!collaborative) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    (async () => {
      try {
        const res = await fetch("/api/training/me?include=all", {
          headers: await getCollaborativeAuthHeaders(),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("LOAD_FAILED");
        const json = await res.json();
        if (cancelled) return;
        const enrollment = json.data?.[0] ?? null;
        setRemoteEnrollment(enrollment);
        setRemoteSubmissions(json.submissions ?? []);
        setRemoteEnrollmentError("");

        const programId = enrollment?.program_id as string | undefined;
        if (!programId) return;

        try {
          const [tasksRes, progressRes] = await Promise.all([
            fetch(`/api/training/programs/${programId}/tasks`, {
              signal: controller.signal,
            }),
            fetch(`/api/training/programs/${programId}/progress`, {
              signal: controller.signal,
            }),
          ]);
          if (cancelled) return;
          if (tasksRes.ok) {
            const tasksJson = await tasksRes.json();
            const curriculum = (tasksJson.data?.curriculum ?? []) as Array<{
              taskId: string;
            }>;
            setCurriculumTaskIds(
              curriculum.length > 0 ? curriculum.map((c) => c.taskId) : null
            );
          } else {
            setCurriculumTaskIds(null);
          }
          if (progressRes.ok) {
            const progressJson = await progressRes.json();
            const selfTasks = (progressJson.data?.tasks ?? []) as Array<{
              taskId: string;
              status: string;
              overdue: boolean;
            }>;
            const map: Record<string, { status: string; overdue: boolean }> = {};
            for (const task of selfTasks) {
              map[task.taskId] = { status: task.status, overdue: task.overdue };
            }
            setTaskProgress(map);
            setCompletionRate(
              typeof progressJson.data?.completionRate === "number"
                ? progressJson.data.completionRate
                : null
            );
          }
        } catch {
          if (!cancelled) setCurriculumTaskIds(null);
        }
      } catch {
        if (cancelled) return;
        setRemoteEnrollment(null);
        setRemoteSubmissions([]);
        setRemoteEnrollmentError(t("enrollmentError"));
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [collaborative, t]);

  // Default to the first task when none is selected yet.
  useEffect(() => {
    if (!selectedTaskId && displayTasks[0]) {
      setSelectedTaskId(displayTasks[0].id);
    }
  }, [displayTasks, selectedTaskId]);

  // Backfill local task records for any registry task not yet stored.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      for (const definition of MVP_TRAINING_TASKS) {
        if (cancelled) return;
        const hasLocal = tasks?.some((task) => task.id === definition.id);
        if (!hasLocal) {
          try {
            await createTrainingTask({
              id: definition.id,
              projectId,
              title: definition.title,
              description: definition.description,
              agent: definition.agent,
              dimension: definition.dimension,
              steps: definition.steps,
              requiresReview: definition.requiresReview,
            });
          } catch {
            /* ignore */
          }
        }
      }
      if (!cancelled) void refetchTasks();
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, tasks, refetchTasks]);

  if (!projectId && !collaborative) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <RemoteLoadError
          error={projectsError}
          onRetry={projectsError ? refetchProjects : undefined}
        />
        {!projectsError && (
          <Card>
            <CardContent className="p-6">{t("needProject")}</CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        <RemoteLoadError
          className="mt-2"
          error={remoteEnrollmentError || remoteDataError}
          onRetry={
            remoteDataError
              ? () => {
                  refetchProjects();
                  refetchTasks();
                }
              : undefined
          }
        />
        {collaborative && !remoteEnrollmentError && !remoteDataError && (
          <p className="mt-2 text-sm text-emerald-600">
            {remoteEnrollment
              ? t("enrolledSync", {
                  name:
                    remoteEnrollment.training_programs?.name ??
                    t("campFallback"),
                })
              : t("notEnrolled")}
          </p>
        )}
      </div>

      {collaborative && remoteEnrollment && (
        <Card>
          <CardContent className="p-4">
            <PeerReviewQueue />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("taskList")}</CardTitle>
            {completionRate != null && (
              <p className="text-xs text-muted-foreground">
                {t("completionRate", { rate: completionRate })}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {displayTasks.map((task) => {
              const progress = taskProgress[task.id];
              const remote = remoteSubmissions.find((s) => s.task_id === task.id);
              const status =
                progress?.status ?? remote?.status ?? "not_started";
              const overdue = progress?.overdue ?? false;
              return (
                <div key={task.id} className="space-y-1">
                  <Button
                    variant={
                      effectiveTaskId === task.id ? "default" : "outline"
                    }
                    className="h-auto w-full justify-start whitespace-normal text-left"
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <span className="flex w-full flex-col gap-1">
                      <span>{task.title}</span>
                      {collaborative && (
                        <Badge
                          variant={overdue ? "destructive" : "secondary"}
                          className="w-fit text-[10px]"
                        >
                          {formatTaskStatus(t, status, overdue)}
                        </Badge>
                      )}
                    </span>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-7 w-full text-xs"
                  >
                    <Link href={`/training/tasks/${task.id}`}>
                      {t("openTask")}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-2">
          {effectiveTaskId ? (
            <CoachWorkspace taskId={effectiveTaskId} dualPane={false} />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {t("loadingTask")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

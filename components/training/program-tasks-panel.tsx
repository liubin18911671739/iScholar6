/**
 * ProgramTasksPanel (components/training/program-tasks-panel.tsx)
 *
 * Functionality:
 * - Staff/TA editor for a program's curriculum: enable/order tasks and set due dates, required, and forced review.
 * - Loads configured tasks and member progress from the tasks/progress endpoints and saves via PUT.
 * - Renders per-member completion badges and exposes a "nudge all" action.
 *
 * Notes:
 * - Task definitions come from `MVP_TRAINING_TASKS`; uses `sonner` toasts and the `training.manage` namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MVP_TRAINING_TASKS } from "@/lib/training/registry";

/** Editable per-task curriculum draft row. */
type TaskDraft = {
  taskId: string;
  enabled: boolean;
  ordinal: number;
  dueAt: string;
  required: boolean;
  requiresReviewOverride: boolean | null;
};

/** Per-member progress summary for the program. */
type MemberProgress = {
  learnerId: string;
  displayName?: string | null;
  completionRate: number;
  requiredDone: number;
  requiredTotal: number;
  tasks: Array<{ taskId: string; status: string; overdue: boolean; title: string }>;
};

/** Convert an ISO timestamp to a `datetime-local` input value. */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local wants YYYY-MM-DDTHH:mm
  return d.toISOString().slice(0, 16);
}

/** Convert a `datetime-local` input value back to an ISO timestamp. */
function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Curriculum and progress editor for a training program. */
export function ProgramTasksPanel({
  programId,
  readOnly = false,
}: {
  programId: string;
  /** TA may view curriculum + progress but cannot edit tasks (staff-only PUT). */
  readOnly?: boolean;
}) {
  const t = useTranslations("training.manage");
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [members, setMembers] = useState<MemberProgress[]>([]);
  const [loading, setLoading] = useState(false);

  // Load configured tasks and member progress in parallel.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, progressRes] = await Promise.all([
        fetch(`/api/training/programs/${programId}/tasks`),
        fetch(`/api/training/programs/${programId}/progress`),
      ]);
      if (tasksRes.ok) {
        const json = await tasksRes.json();
        const configured = (json.data?.rows ?? []) as Array<{
          task_id: string;
          ordinal: number;
          due_at?: string | null;
          required?: boolean;
          requires_review_override?: boolean | null;
        }>;
        const byId = new Map(configured.map((r) => [r.task_id, r]));
        const next = MVP_TRAINING_TASKS.map((task, index) => {
          const row = byId.get(task.id);
          return {
            taskId: task.id,
            enabled: configured.length === 0 ? true : Boolean(row),
            ordinal: row?.ordinal ?? index,
            dueAt: toLocalInputValue(row?.due_at),
            required: row?.required ?? true,
            requiresReviewOverride:
              row?.requires_review_override === undefined
                ? null
                : row.requires_review_override,
          } satisfies TaskDraft;
        });
        setDrafts(next.sort((a, b) => a.ordinal - b.ordinal));
      }
      if (progressRes.ok) {
        const json = await progressRes.json();
        setMembers(json.data?.members ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Merge a partial update into a single task draft.
  function patchDraft(taskId: string, patch: Partial<TaskDraft>) {
    setDrafts((rows) =>
      rows.map((row) => (row.taskId === taskId ? { ...row, ...patch } : row))
    );
  }

  // Reindex enabled drafts and persist the curriculum.
  async function saveTasks() {
    const tasks = drafts
      .filter((d) => d.enabled)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((d, index) => ({
        taskId: d.taskId,
        ordinal: index,
        dueAt: fromLocalInputValue(d.dueAt),
        required: d.required,
        requiresReviewOverride: d.requiresReviewOverride,
      }));
    const res = await fetch(`/api/training/programs/${programId}/tasks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(String(json.error ?? t("saveFailed")));
      return;
    }
    toast.success(t("tasksSaved"));
    await load();
  }

  // Send a reminder nudge to all active members.
  async function nudgeAll() {
    const res = await fetch(`/api/training/programs/${programId}/nudge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allActive: true }),
    });
    if (!res.ok) {
      toast.error(t("nudgeFailed"));
      return;
    }
    toast.success(t("nudgeSuccess"));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("tasksTitle")}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void nudgeAll()} disabled={loading}>
              {t("actions.nudgeAll")}
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={() => void saveTasks()} disabled={loading}>
                {t("actions.saveTasks")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {readOnly ? t("tasksReadOnlyHint") : t("tasksHint")}
          </p>
          {drafts.map((draft) => {
            const meta = MVP_TRAINING_TASKS.find((t0) => t0.id === draft.taskId);
            return (
              <div
                key={draft.taskId}
                className="grid gap-2 rounded border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    disabled={readOnly}
                    onChange={(e) =>
                      patchDraft(draft.taskId, { enabled: e.target.checked })
                    }
                  />
                  <span className="font-medium">{meta?.title ?? draft.taskId}</span>
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[10px]">{t("fields.ordinal")}</Label>
                    <Input
                      type="number"
                      className="h-8"
                      value={draft.ordinal}
                      disabled={readOnly}
                      onChange={(e) =>
                        patchDraft(draft.taskId, {
                          ordinal: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">{t("fields.dueAt")}</Label>
                    <Input
                      type="datetime-local"
                      className="h-8"
                      value={draft.dueAt}
                      disabled={readOnly}
                      onChange={(e) =>
                        patchDraft(draft.taskId, { dueAt: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-3 pb-1 text-xs">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={draft.required}
                        disabled={readOnly}
                        onChange={(e) =>
                          patchDraft(draft.taskId, { required: e.target.checked })
                        }
                      />
                      {t("fields.required")}
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={draft.requiresReviewOverride === true}
                        disabled={readOnly}
                        onChange={(e) =>
                          patchDraft(draft.taskId, {
                            requiresReviewOverride: e.target.checked ? true : null,
                          })
                        }
                      />
                      {t("fields.forceReview")}
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("progressTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("progressEmpty")}</p>
          )}
          {members.map((member) => (
            <div key={member.learnerId} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {member.displayName || member.learnerId.slice(0, 8) + "…"}
                </span>
                <Badge variant="secondary">
                  {member.completionRate}% ({member.requiredDone}/{member.requiredTotal})
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {member.tasks.map((task) => (
                  <Badge
                    key={task.taskId}
                    variant={task.overdue ? "destructive" : "outline"}
                    className="text-[10px]"
                    title={task.title}
                  >
                    {task.status}
                    {task.overdue ? " !" : ""}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

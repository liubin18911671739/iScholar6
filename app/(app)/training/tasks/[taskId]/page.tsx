/**
 * Training Task Detail (/training/tasks/[taskId])
 *
 * Functionality:
 * - Resolves the dynamic taskId param to a typed task definition.
 * - Renders the duo-pane CoachWorkspace for the selected training task.
 * - Shows a loading state with a link back to the task list when the id is unknown.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoachWorkspace } from "@/components/training/coach-workspace";
import { getTypedTaskDefinition } from "@/lib/training/step-types";

/** Route entry for a single training task; renders the duo-pane coach workspace. */
export default function TrainingTaskPage() {
  const params = useParams();
  // Read the dynamic task id from the route params as a string.
  const taskId = String(params.taskId ?? "");
  const t = useTranslations("training.learner");
  // Resolve the typed task definition; unknown ids fall back to the list view below.
  const typed = getTypedTaskDefinition(taskId);

  // Fallback state shown when the task definition cannot be resolved.
  if (!typed) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <p className="text-sm text-muted-foreground">{t("loadingTask")}</p>
        <Button asChild variant="outline">
          <Link href="/training">{t("taskList")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Button asChild variant="ghost" size="sm" className="gap-1">
        <Link href="/training">
          <ArrowLeft className="h-4 w-4" />
          {t("taskList")}
        </Link>
      </Button>
      <CoachWorkspace taskId={taskId} dualPane />
    </div>
  );
}

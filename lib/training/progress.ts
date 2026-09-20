/**
 * Training Progress (lib/training/progress.ts)
 *
 * Functionality:
 * - Resolves camp curricula from configured tasks or the MVP fallback (`resolveProgramCurriculum`).
 * - Derives per-task status from submissions/reviews and flags overdue work.
 * - Aggregates per-learner and per-class progress into `LearnerTaskProgress` rows.
 *
 * Notes:
 * - Pure logic over submission/review records; catalog may come from packs.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { MVP_TRAINING_TASKS, type TrainingTaskDefinition } from "./registry";
import {
  buildTaskCatalog,
  getCatalogTask,
  type CatalogTaskDefinition,
  type TrainingTaskPackLike,
} from "./task-catalog";

/** Normalized lifecycle status of a learner's task. */
export type ProgressStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "needs_revision"
  | "approved"
  | "escalated";

/** Camp-level configuration for one curriculum task. */
export type ProgramTaskConfig = {
  taskId: string;
  ordinal: number;
  dueAt?: string | null;
  required: boolean;
  requiresReviewOverride?: boolean | null;
};

/** Minimal submission shape needed for status derivation. */
export type SubmissionLike = {
  task_id: string;
  learner_id: string;
  status: string;
  updated_at?: string;
};

/** Minimal review shape needed for status derivation and scoring. */
export type ReviewLike = {
  submission_id?: string;
  task_id?: string;
  learner_id?: string;
  decision: string;
  created_at: string;
  score?: number | null;
};

/** Optional pack/catalog sources for curriculum resolution. */
export type ResolveCurriculumOptions = {
  packs?: TrainingTaskPackLike[];
  catalog?: Map<string, CatalogTaskDefinition>;
};

/** Resolve curriculum: configured tasks or full MVP fallback; multi-source catalog. */
export function resolveProgramCurriculum(
  configs: ProgramTaskConfig[] | null | undefined,
  options?: ResolveCurriculumOptions
): Array<ProgramTaskConfig & { definition: TrainingTaskDefinition }> {
  const catalog = options?.catalog ?? buildTaskCatalog(options?.packs ?? []);

  const source =
    configs && configs.length > 0
      ? [...configs].sort((a, b) => a.ordinal - b.ordinal)
      : MVP_TRAINING_TASKS.map((task, index) => ({
          taskId: task.id,
          ordinal: index,
          dueAt: null,
          required: true,
          requiresReviewOverride: null,
        }));

  return source
    .map((cfg) => {
      const definition = getCatalogTask(cfg.taskId, catalog);
      if (!definition) return null;
      const core: TrainingTaskDefinition = {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        agent: definition.agent,
        dimension: definition.dimension,
        steps: definition.steps,
        requiresReview: definition.requiresReview,
      };
      return { ...cfg, definition: core };
    })
    .filter(Boolean) as Array<ProgramTaskConfig & { definition: TrainingTaskDefinition }>;
}

/** Map a submission plus its latest review into a single progress status. */
export function deriveTaskStatus(
  submission: SubmissionLike | undefined,
  latestReview: ReviewLike | undefined
): ProgressStatus {
  if (!submission) return "not_started";
  if (submission.status === "in_progress") return "draft";
  if (submission.status === "completed" || latestReview?.decision === "approved") {
    return "approved";
  }
  if (submission.status === "escalated" || latestReview?.decision === "escalated") {
    return "escalated";
  }
  if (submission.status === "needs_review" || latestReview?.decision === "needs_revision") {
    return "needs_revision";
  }
  if (submission.status === "submitted") return "submitted";
  return "draft";
}

/** True when a not-yet-approved task's due date has already passed. */
export function isOverdue(
  status: ProgressStatus,
  dueAt?: string | null,
  now = Date.now()
): boolean {
  if (!dueAt) return false;
  if (status === "approved") return false;
  return new Date(dueAt).getTime() < now;
}

/** Flattened per-task progress row for one learner. */
export type LearnerTaskProgress = {
  taskId: string;
  title: string;
  agent: string;
  status: ProgressStatus;
  required: boolean;
  dueAt: string | null;
  overdue: boolean;
  requiresReview: boolean;
  score?: number | null;
};

/** Combine curriculum, submissions, and reviews into one learner's task progress. */
export function buildLearnerProgress(params: {
  curriculum: Array<ProgramTaskConfig & { definition: TrainingTaskDefinition }>;
  submissions: SubmissionLike[];
  reviewsByTask: Map<string, ReviewLike>;
  now?: number;
}): {
  tasks: LearnerTaskProgress[];
  completionRate: number;
  requiredTotal: number;
  requiredDone: number;
} {
  const now = params.now ?? Date.now();
  const subByTask = new Map(params.submissions.map((s) => [s.task_id, s]));

  const tasks = params.curriculum.map((cfg) => {
    const submission = subByTask.get(cfg.taskId);
    const review = params.reviewsByTask.get(cfg.taskId);
    const status = deriveTaskStatus(submission, review);
    const requiresReview =
      cfg.requiresReviewOverride ?? cfg.definition.requiresReview;
    return {
      taskId: cfg.taskId,
      title: cfg.definition.title,
      agent: cfg.definition.agent,
      status,
      required: cfg.required,
      dueAt: cfg.dueAt ?? null,
      overdue: isOverdue(status, cfg.dueAt, now),
      requiresReview,
      score: review?.score ?? null,
    } satisfies LearnerTaskProgress;
  });

  const required = tasks.filter((t) => t.required);
  const requiredDone = required.filter((t) => t.status === "approved").length;
  const completionRate =
    required.length === 0 ? 0 : Math.round((requiredDone / required.length) * 100);

  return {
    tasks,
    completionRate,
    requiredTotal: required.length,
    requiredDone,
  };
}

/** Build per-learner progress rows for all non-removed enrollments in a class. */
export function buildClassProgress(params: {
  curriculum: Array<ProgramTaskConfig & { definition: TrainingTaskDefinition }>;
  enrollments: Array<{ learner_id: string; display_name?: string | null; status: string }>;
  submissions: SubmissionLike[];
  reviews: Array<ReviewLike & { learner_id: string; task_id: string }>;
  now?: number;
}) {
  const activeLearners = params.enrollments.filter((e) => e.status !== "removed");
  const subsByLearner = new Map<string, SubmissionLike[]>();
  for (const sub of params.submissions) {
    const list = subsByLearner.get(sub.learner_id) ?? [];
    list.push(sub);
    subsByLearner.set(sub.learner_id, list);
  }
  const reviewsByLearnerTask = new Map<string, ReviewLike>();
  for (const review of params.reviews) {
    const key = `${review.learner_id}::${review.task_id}`;
    const existing = reviewsByLearnerTask.get(key);
    if (
      !existing ||
      new Date(review.created_at).getTime() > new Date(existing.created_at).getTime()
    ) {
      reviewsByLearnerTask.set(key, review);
    }
  }

  return activeLearners.map((enrollment) => {
    const reviewsByTask = new Map<string, ReviewLike>();
    Array.from(reviewsByLearnerTask.entries()).forEach(([key, review]) => {
      if (key.startsWith(enrollment.learner_id + "::")) {
        reviewsByTask.set(key.split("::")[1], review);
      }
    });
    const progress = buildLearnerProgress({
      curriculum: params.curriculum,
      submissions: subsByLearner.get(enrollment.learner_id) ?? [],
      reviewsByTask,
      now: params.now,
    });
    return {
      learnerId: enrollment.learner_id,
      displayName: enrollment.display_name ?? null,
      status: enrollment.status,
      ...progress,
    };
  });
}

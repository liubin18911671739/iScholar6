/**
 * Class Reporting (lib/training/reporting.ts)
 *
 * Functionality:
 * - Aggregates enrollments, submissions, and reviews into a `ClassReport`.
 * - Computes per-task submit/approve rates, review load, and a risk list.
 * - Re-exports `deriveTaskStatus` for status-only consumers.
 *
 * Notes:
 * - Pure aggregation built on `progress.ts` helpers; no network access.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import {
  buildClassProgress,
  deriveTaskStatus,
  resolveProgramCurriculum,
  type ProgramTaskConfig,
  type ProgressStatus,
  type ReviewLike,
  type SubmissionLike,
} from "./progress";

/** Task counts per lifecycle status for the class funnel. */
export type FunnelCounts = Record<ProgressStatus, number>;

/** Aggregate metrics for one curriculum task. */
export type TaskReportRow = {
  taskId: string;
  title: string;
  submitRate: number;
  approveRate: number;
  avgScore: number | null;
  submitted: number;
  approved: number;
  learners: number;
};

/** Pending review backlog and average wait time. */
export type ReviewLoad = {
  pending: number;
  avgWaitHours: number | null;
  byReviewer: Array<{ reviewerId: string; count: number }>;
};

/** At-risk learner flagged by revision/escalation counts. */
export type RiskRow = {
  learnerId: string;
  displayName: string | null;
  revisionCount: number;
  escalatedCount: number;
};

/** Full class-level report payload. */
export type ClassReport = {
  memberCount: number;
  activeCount: number;
  removedCount: number;
  funnel: FunnelCounts;
  byTask: TaskReportRow[];
  reviewLoad: ReviewLoad;
  risk: RiskRow[];
  avgCompletionRate: number;
};

// Zero-initialized funnel counters keyed by progress status.
function emptyFunnel(): FunnelCounts {
  return {
    not_started: 0,
    draft: 0,
    submitted: 0,
    needs_revision: 0,
    approved: 0,
    escalated: 0,
  };
}

/**
 * Pure class-level report aggregation for collaborative training camps.
 */
export function buildClassReport(params: {
  curriculumConfigs?: ProgramTaskConfig[] | null;
  /** Optional multi-source catalog (packs). */
  packs?: import("./task-catalog").TrainingTaskPackLike[];
  enrollments: Array<{
    learner_id: string;
    status: string;
    display_name?: string | null;
  }>;
  submissions: Array<
    SubmissionLike & {
      id?: string;
      updated_at?: string;
    }
  >;
  reviews: Array<
    ReviewLike & {
      learner_id: string;
      task_id: string;
      reviewer_id?: string;
    }
  >;
  now?: number;
}): ClassReport {
  const now = params.now ?? Date.now();
  const curriculum = resolveProgramCurriculum(params.curriculumConfigs, {
    packs: params.packs,
  });
  const active = params.enrollments.filter((e) => e.status !== "removed");
  const removed = params.enrollments.filter((e) => e.status === "removed");

  const members = buildClassProgress({
    curriculum,
    enrollments: params.enrollments,
    submissions: params.submissions,
    reviews: params.reviews,
    now,
  });

  const funnel = emptyFunnel();
  // Count each required task cell across active learners for funnel density.
  for (const member of members) {
    for (const task of member.tasks) {
      if (!task.required) continue;
      funnel[task.status] += 1;
    }
  }

  const activeCount = active.length;
  const byTask: TaskReportRow[] = curriculum.map((cfg) => {
    let submitted = 0;
    let approved = 0;
    const scores: number[] = [];
    for (const member of members) {
      const cell = member.tasks.find((t) => t.taskId === cfg.taskId);
      if (!cell) continue;
      if (cell.status !== "not_started" && cell.status !== "draft") submitted += 1;
      if (cell.status === "approved") approved += 1;
      if (typeof cell.score === "number") scores.push(cell.score);
    }
    const learners = Math.max(activeCount, 1);
    return {
      taskId: cfg.taskId,
      title: cfg.definition.title,
      learners: activeCount,
      submitted,
      approved,
      submitRate: activeCount === 0 ? 0 : Math.round((submitted / learners) * 100),
      approveRate: activeCount === 0 ? 0 : Math.round((approved / learners) * 100),
      avgScore:
        scores.length === 0
          ? null
          : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    };
  });

  // Pending = submitted status submissions waiting review.
  const pendingSubs = params.submissions.filter((s) => s.status === "submitted");
  const waits = pendingSubs
    .map((s) => (s.updated_at ? now - new Date(s.updated_at).getTime() : 0))
    .filter((ms) => ms > 0);
  const avgWaitHours =
    waits.length === 0
      ? null
      : Math.round((waits.reduce((a, b) => a + b, 0) / waits.length / 3_600_000) * 10) / 10;

  const byReviewerMap = new Map<string, number>();
  for (const review of params.reviews) {
    if (!review.reviewer_id) continue;
    byReviewerMap.set(
      review.reviewer_id,
      (byReviewerMap.get(review.reviewer_id) ?? 0) + 1
    );
  }

  // Risk: learners with multiple needs_revision decisions or escalations.
  const revisionByLearner = new Map<string, number>();
  const escalatedByLearner = new Map<string, number>();
  for (const review of params.reviews) {
    if (review.decision === "needs_revision") {
      revisionByLearner.set(
        review.learner_id,
        (revisionByLearner.get(review.learner_id) ?? 0) + 1
      );
    }
    if (review.decision === "escalated") {
      escalatedByLearner.set(
        review.learner_id,
        (escalatedByLearner.get(review.learner_id) ?? 0) + 1
      );
    }
  }

  const nameById = new Map(
    params.enrollments.map((e) => [e.learner_id, e.display_name ?? null])
  );
  const risk: RiskRow[] = active
    .map((e) => ({
      learnerId: e.learner_id,
      displayName: nameById.get(e.learner_id) ?? null,
      revisionCount: revisionByLearner.get(e.learner_id) ?? 0,
      escalatedCount: escalatedByLearner.get(e.learner_id) ?? 0,
    }))
    .filter((r) => r.revisionCount >= 2 || r.escalatedCount >= 1)
    .sort(
      (a, b) =>
        b.revisionCount + b.escalatedCount * 2 - (a.revisionCount + a.escalatedCount * 2)
    );

  const avgCompletionRate =
    members.length === 0
      ? 0
      : Math.round(
          members.reduce((sum, m) => sum + m.completionRate, 0) / members.length
        );

  return {
    memberCount: params.enrollments.length,
    activeCount,
    removedCount: removed.length,
    funnel,
    byTask,
    reviewLoad: {
      pending: pendingSubs.length,
      avgWaitHours,
      byReviewer: Array.from(byReviewerMap.entries()).map(([reviewerId, count]) => ({
        reviewerId,
        count,
      })),
    },
    risk,
    avgCompletionRate,
  };
}

/** Re-export for callers that only need status derivation helpers. */
export { deriveTaskStatus };

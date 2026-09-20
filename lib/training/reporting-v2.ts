/**
 * Cross-Program Reporting V2 (lib/training/reporting-v2.ts)
 *
 * Functionality:
 * - Rolls per-program class reports into cross-program and semester dashboards.
 * - Aggregates reviewer KPIs and builds explainable risk heatmaps.
 * - Merges review-load summaries and computes token-Jaccard similarity hints.
 *
 * Notes:
 * - Pure aggregation over `reporting.ts` outputs; no data fetching.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { ClassReport, ReviewLoad } from "./reporting";

/** A single program's report plus identifying metadata. */
export type ProgramSnapshot = {
  programId: string;
  name: string;
  status?: string;
  cohortName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  report: ClassReport;
};

/** One row of the cross-program comparison table. */
export type CrossProgramRow = {
  programId: string;
  name: string;
  status?: string;
  cohortName?: string | null;
  memberCount: number;
  avgCompletionRate: number;
  pendingReviews: number;
  avgWaitHours: number | null;
  riskCount: number;
  submitRateAvg: number;
  approveRateAvg: number;
};

/** Aggregated review activity metrics for one reviewer. */
export type ReviewerKpi = {
  reviewerId: string;
  reviewCount: number;
  approved: number;
  needsRevision: number;
  escalated: number;
  avgScore: number | null;
};

/** One learner x task cell in the risk heatmap. */
export type RiskHeatCell = {
  learnerId: string;
  displayName: string | null;
  taskId: string;
  score: number;
  reasons: string[];
};

/** Learner-by-task risk matrix with named rows/columns. */
export type RiskHeatmap = {
  learners: Array<{ learnerId: string; displayName: string | null }>;
  taskIds: string[];
  cells: RiskHeatCell[];
};

/** Semester-scoped rollup of programs, totals, and reviewer KPIs. */
export type SemesterDashboard = {
  window: { from: string; to: string };
  programs: CrossProgramRow[];
  totals: {
    programs: number;
    members: number;
    pendingReviews: number;
    avgCompletionRate: number;
  };
  reviewerKpis: ReviewerKpi[];
};

// Round to one decimal place; returns 0 for an empty input.
function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/** Reduce one program snapshot into a cross-program comparison row. */
export function toCrossProgramRow(snap: ProgramSnapshot): CrossProgramRow {
  const rates = snap.report.byTask.map((t) => t.submitRate);
  const approve = snap.report.byTask.map((t) => t.approveRate);
  return {
    programId: snap.programId,
    name: snap.name,
    status: snap.status,
    cohortName: snap.cohortName,
    memberCount: snap.report.activeCount,
    avgCompletionRate: snap.report.avgCompletionRate,
    pendingReviews: snap.report.reviewLoad.pending,
    avgWaitHours: snap.report.reviewLoad.avgWaitHours,
    riskCount: snap.report.risk.length,
    submitRateAvg: avg(rates),
    approveRateAvg: avg(approve),
  };
}

/** Aggregate program snapshots and reviews into a semester dashboard. */
export function buildSemesterDashboard(params: {
  from: string;
  to: string;
  snapshots: ProgramSnapshot[];
  reviews?: Array<{
    reviewer_id: string;
    decision: string;
    score?: number | null;
  }>;
}): SemesterDashboard {
  const programs = params.snapshots.map(toCrossProgramRow);
  const members = programs.reduce((s, p) => s + p.memberCount, 0);
  const pending = programs.reduce((s, p) => s + p.pendingReviews, 0);
  const completion = avg(programs.map((p) => p.avgCompletionRate));

  const byReviewer = new Map<
    string,
    { count: number; approved: number; needsRevision: number; escalated: number; scores: number[] }
  >();
  for (const review of params.reviews ?? []) {
    const row = byReviewer.get(review.reviewer_id) ?? {
      count: 0,
      approved: 0,
      needsRevision: 0,
      escalated: 0,
      scores: [],
    };
    row.count += 1;
    if (review.decision === "approved") row.approved += 1;
    if (review.decision === "needs_revision") row.needsRevision += 1;
    if (review.decision === "escalated") row.escalated += 1;
    if (typeof review.score === "number") row.scores.push(review.score);
    byReviewer.set(review.reviewer_id, row);
  }

  const reviewerKpis: ReviewerKpi[] = Array.from(byReviewer.entries()).map(
    ([reviewerId, row]) => ({
      reviewerId,
      reviewCount: row.count,
      approved: row.approved,
      needsRevision: row.needsRevision,
      escalated: row.escalated,
      avgScore: row.scores.length ? avg(row.scores) : null,
    })
  );
  reviewerKpis.sort((a, b) => b.reviewCount - a.reviewCount);

  return {
    window: { from: params.from, to: params.to },
    programs,
    totals: {
      programs: programs.length,
      members,
      pendingReviews: pending,
      avgCompletionRate: completion,
    },
    reviewerKpis,
  };
}

/** Explainable risk score — not a plagiarism verdict. */
export function scoreRiskCell(params: {
  revisionCount: number;
  escalatedCount: number;
  sensitiveHits?: number;
  similarityHint?: number;
  overdue?: boolean;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (params.revisionCount >= 2) {
    score += 40;
    reasons.push(`revisions:${params.revisionCount}`);
  } else if (params.revisionCount === 1) {
    score += 15;
    reasons.push("revisions:1");
  }
  if (params.escalatedCount > 0) {
    score += 35;
    reasons.push(`escalated:${params.escalatedCount}`);
  }
  if ((params.sensitiveHits ?? 0) > 0) {
    score += 20;
    reasons.push(`sensitive:${params.sensitiveHits}`);
  }
  if ((params.similarityHint ?? 0) >= 0.85) {
    score += 25;
    reasons.push(`similarity:${Math.round((params.similarityHint ?? 0) * 100)}`);
  }
  if (params.overdue) {
    score += 15;
    reasons.push("overdue");
  }
  return { score: Math.min(100, score), reasons };
}

/** Score each learner/task cell and attach display names for the heatmap. */
export function buildRiskHeatmap(params: {
  learners: Array<{ learnerId: string; displayName: string | null }>;
  taskIds: string[];
  cells: Array<{
    learnerId: string;
    taskId: string;
    revisionCount: number;
    escalatedCount: number;
    sensitiveHits?: number;
    overdue?: boolean;
  }>;
}): RiskHeatmap {
  const nameById = new Map(params.learners.map((l) => [l.learnerId, l.displayName]));
  const cells: RiskHeatCell[] = params.cells.map((cell) => {
    const { score, reasons } = scoreRiskCell(cell);
    return {
      learnerId: cell.learnerId,
      displayName: nameById.get(cell.learnerId) ?? null,
      taskId: cell.taskId,
      score,
      reasons,
    };
  });
  return {
    learners: params.learners,
    taskIds: params.taskIds,
    cells,
  };
}

/** Sum pending counts and merge per-reviewer counts across review loads. */
export function mergeReviewLoad(loads: ReviewLoad[]): ReviewLoad {
  const pending = loads.reduce((s, l) => s + l.pending, 0);
  const waits = loads
    .map((l) => l.avgWaitHours)
    .filter((h): h is number => h != null);
  const byReviewer = new Map<string, number>();
  for (const load of loads) {
    for (const row of load.byReviewer) {
      byReviewer.set(row.reviewerId, (byReviewer.get(row.reviewerId) ?? 0) + row.count);
    }
  }
  return {
    pending,
    avgWaitHours: waits.length ? avg(waits) : null,
    byReviewer: Array.from(byReviewer.entries()).map(([reviewerId, count]) => ({
      reviewerId,
      count,
    })),
  };
}

/** Token Jaccard similarity for plagiarism heuristic (0–1). */
export function textSimilarityHint(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const A = tok(a);
  const B = tok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  Array.from(A).forEach((w) => {
    if (B.has(w)) inter += 1;
  });
  return inter / (A.size + B.size - inter);
}

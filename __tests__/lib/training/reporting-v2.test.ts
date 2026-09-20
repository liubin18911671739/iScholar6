import { describe, expect, it } from "vitest";
import {
  buildSemesterDashboard,
  scoreRiskCell,
  textSimilarityHint,
  toCrossProgramRow,
} from "@/lib/training/reporting-v2";
import type { ClassReport } from "@/lib/training/reporting";

const emptyReport = (): ClassReport => ({
  memberCount: 10,
  activeCount: 8,
  removedCount: 2,
  funnel: {
    not_started: 1,
    draft: 1,
    submitted: 2,
    needs_revision: 1,
    approved: 3,
    escalated: 0,
  },
  byTask: [
    {
      taskId: "research-question",
      title: "Q",
      submitRate: 80,
      approveRate: 50,
      avgScore: 80,
      submitted: 8,
      approved: 4,
      learners: 10,
    },
  ],
  reviewLoad: {
    pending: 3,
    avgWaitHours: 12,
    byReviewer: [{ reviewerId: "r1", count: 5 }],
  },
  risk: [{ learnerId: "l1", displayName: "A", revisionCount: 2, escalatedCount: 0 }],
  avgCompletionRate: 62.5,
});

describe("reporting-v2", () => {
  it("builds cross-program row", () => {
    const row = toCrossProgramRow({
      programId: "p1",
      name: "Camp",
      report: emptyReport(),
    });
    expect(row.pendingReviews).toBe(3);
    expect(row.avgCompletionRate).toBe(62.5);
    expect(row.riskCount).toBe(1);
  });

  it("aggregates semester dashboard + reviewer KPI", () => {
    const dash = buildSemesterDashboard({
      from: "2026-01-01",
      to: "2026-06-30",
      snapshots: [
        { programId: "p1", name: "A", report: emptyReport() },
        { programId: "p2", name: "B", report: emptyReport() },
      ],
      reviews: [
        { reviewer_id: "r1", decision: "approved", score: 90 },
        { reviewer_id: "r1", decision: "needs_revision", score: 60 },
        { reviewer_id: "r2", decision: "escalated", score: null },
      ],
    });
    expect(dash.totals.programs).toBe(2);
    expect(dash.totals.members).toBe(16);
    expect(dash.reviewerKpis[0].reviewerId).toBe("r1");
    expect(dash.reviewerKpis[0].reviewCount).toBe(2);
  });

  it("scores risk with explainable reasons", () => {
    const { score, reasons } = scoreRiskCell({
      revisionCount: 3,
      escalatedCount: 1,
      sensitiveHits: 1,
      overdue: true,
    });
    expect(score).toBeGreaterThanOrEqual(70);
    expect(reasons.some((r) => r.startsWith("revisions"))).toBe(true);
    expect(reasons).toContain("overdue");
  });

  it("computes text similarity heuristic", () => {
    const sim = textSimilarityHint(
      "tourism destination image short video marketing",
      "tourism destination image short video marketing analysis"
    );
    expect(sim).toBeGreaterThan(0.5);
  });
});

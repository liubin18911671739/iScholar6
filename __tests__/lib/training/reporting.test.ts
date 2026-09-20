import { describe, expect, it } from "vitest";
import { buildClassReport } from "@/lib/training/reporting";

describe("buildClassReport", () => {
  it("aggregates funnel, task rates, pending load, and risk", () => {
    const report = buildClassReport({
      curriculumConfigs: [
        { taskId: "research-question", ordinal: 0, required: true },
        { taskId: "retrieval-query", ordinal: 1, required: true },
      ],
      enrollments: [
        { learner_id: "u1", status: "active", display_name: "Ada" },
        { learner_id: "u2", status: "active", display_name: "Bob" },
        { learner_id: "u3", status: "removed", display_name: "Gone" },
      ],
      submissions: [
        {
          id: "s1",
          task_id: "research-question",
          learner_id: "u1",
          status: "completed",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "s2",
          task_id: "retrieval-query",
          learner_id: "u1",
          status: "submitted",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "s3",
          task_id: "research-question",
          learner_id: "u2",
          status: "needs_review",
          updated_at: "2026-01-03T00:00:00.000Z",
        },
      ],
      reviews: [
        {
          submission_id: "s1",
          learner_id: "u1",
          task_id: "research-question",
          decision: "approved",
          score: 90,
          created_at: "2026-01-01T12:00:00.000Z",
          reviewer_id: "staff1",
        },
        {
          submission_id: "s3",
          learner_id: "u2",
          task_id: "research-question",
          decision: "needs_revision",
          created_at: "2026-01-03T12:00:00.000Z",
          reviewer_id: "staff1",
        },
        {
          submission_id: "s3",
          learner_id: "u2",
          task_id: "research-question",
          decision: "needs_revision",
          created_at: "2026-01-04T12:00:00.000Z",
          reviewer_id: "staff2",
        },
      ],
      now: new Date("2026-01-05T00:00:00.000Z").getTime(),
    });

    expect(report.activeCount).toBe(2);
    expect(report.removedCount).toBe(1);
    expect(report.funnel.approved).toBeGreaterThanOrEqual(1);
    expect(report.reviewLoad.pending).toBe(1);
    expect(report.reviewLoad.byReviewer.length).toBe(2);
    expect(report.byTask).toHaveLength(2);
    expect(report.byTask[0].approveRate).toBeGreaterThanOrEqual(0);
    // u2 has 2 needs_revision → risk
    expect(report.risk.some((r) => r.learnerId === "u2")).toBe(true);
  });
});

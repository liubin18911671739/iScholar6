import { describe, expect, it } from "vitest";
import {
  buildLearnerProgress,
  deriveTaskStatus,
  isOverdue,
  resolveProgramCurriculum,
} from "@/lib/training/progress";

describe("training progress", () => {
  it("falls back to all MVP tasks when config empty", () => {
    const curriculum = resolveProgramCurriculum([]);
    expect(curriculum.length).toBe(8);
  });

  it("derives statuses from submission + review", () => {
    expect(deriveTaskStatus(undefined, undefined)).toBe("not_started");
    expect(
      deriveTaskStatus({ task_id: "t", learner_id: "l", status: "in_progress" }, undefined)
    ).toBe("draft");
    expect(
      deriveTaskStatus({ task_id: "t", learner_id: "l", status: "submitted" }, undefined)
    ).toBe("submitted");
    expect(
      deriveTaskStatus(
        { task_id: "t", learner_id: "l", status: "needs_review" },
        { decision: "needs_revision", created_at: "2026-01-01T00:00:00.000Z" }
      )
    ).toBe("needs_revision");
    expect(
      deriveTaskStatus(
        { task_id: "t", learner_id: "l", status: "completed" },
        { decision: "approved", created_at: "2026-01-01T00:00:00.000Z" }
      )
    ).toBe("approved");
  });

  it("marks overdue when due and not approved", () => {
    const past = "2020-01-01T00:00:00.000Z";
    expect(isOverdue("submitted", past)).toBe(true);
    expect(isOverdue("approved", past)).toBe(false);
    expect(isOverdue("submitted", null)).toBe(false);
  });

  it("computes completion rate for required tasks only", () => {
    const curriculum = resolveProgramCurriculum([
      { taskId: "research-question", ordinal: 0, required: true },
      { taskId: "retrieval-query", ordinal: 1, required: false },
    ]);
    const result = buildLearnerProgress({
      curriculum,
      submissions: [
        {
          task_id: "research-question",
          learner_id: "u1",
          status: "completed",
        },
      ],
      reviewsByTask: new Map([
        [
          "research-question",
          {
            decision: "approved",
            created_at: "2026-01-02T00:00:00.000Z",
            score: 90,
          },
        ],
      ]),
    });
    expect(result.requiredTotal).toBe(1);
    expect(result.requiredDone).toBe(1);
    expect(result.completionRate).toBe(100);
    expect(result.tasks[0].status).toBe("approved");
  });
});

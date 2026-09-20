import { describe, expect, it } from "vitest";
import {
  anonymizeLearnerToken,
  pickPeerReviewer,
  stableIndex,
} from "@/lib/training/peer-review";

describe("peer review assignment", () => {
  it("never assigns self", () => {
    const reviewer = pickPeerReviewer({
      submissionId: "sub-1",
      authorLearnerId: "author",
      candidates: [
        { learnerId: "author", status: "active" },
        { learnerId: "peer-a", status: "active" },
        { learnerId: "peer-b", status: "active" },
      ],
    });
    expect(reviewer).not.toBe("author");
    expect(reviewer === "peer-a" || reviewer === "peer-b").toBe(true);
  });

  it("returns null when only author", () => {
    expect(
      pickPeerReviewer({
        submissionId: "s",
        authorLearnerId: "a",
        candidates: [{ learnerId: "a", status: "active" }],
      })
    ).toBeNull();
  });

  it("is deterministic for same seed", () => {
    const a = pickPeerReviewer({
      submissionId: "fixed-sub",
      authorLearnerId: "a",
      candidates: [
        { learnerId: "b", status: "active" },
        { learnerId: "c", status: "active" },
        { learnerId: "d", status: "active" },
      ],
    });
    const b = pickPeerReviewer({
      submissionId: "fixed-sub",
      authorLearnerId: "a",
      candidates: [
        { learnerId: "b", status: "active" },
        { learnerId: "c", status: "active" },
        { learnerId: "d", status: "active" },
      ],
    });
    expect(a).toBe(b);
  });

  it("stableIndex stays in range", () => {
    expect(stableIndex("x", 5)).toBeGreaterThanOrEqual(0);
    expect(stableIndex("x", 5)).toBeLessThan(5);
  });

  it("anonymizes without leaking full id", () => {
    const token = anonymizeLearnerToken("uuid-secret-value");
    expect(token).toMatch(/^P-[0-9A-F]{6}$/);
    expect(token).not.toContain("uuid");
  });
});

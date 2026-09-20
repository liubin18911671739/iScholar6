import { describe, expect, it } from "vitest";
import {
  buildLmsGradebookRows,
  toAgsScoreLines,
  toUnitScore,
} from "@/lib/lms/gradebook";

const learners = [
  {
    learnerId: "u1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    overall: 88,
    status: "active",
    taskScores: { "research-question": 90, design: 86 },
  },
  {
    learnerId: "u2",
    displayName: "Bob",
    email: null,
    overall: null,
    status: "active",
    taskScores: {},
  },
];

describe("LMS gradebook", () => {
  it("maps unit score for canvas", () => {
    expect(toUnitScore(100)).toBe(1);
    expect(toUnitScore(50)).toBe(0.5);
    expect(toUnitScore(null)).toBeNull();
  });

  it("builds canvas CSV rows", () => {
    const rows = buildLmsGradebookRows(learners, "canvas", { courseName: "Camp" });
    expect(rows[0].Student).toBe("Ada Lovelace");
    expect(rows[0]["SIS Login ID"]).toBe("ada@example.com");
    expect(rows[0].Overall).toBe(88);
  });

  it("builds moodle CSV rows", () => {
    const rows = buildLmsGradebookRows(learners, "moodle");
    expect(rows[0]["First name"]).toBe("Ada");
    expect(rows[0]["Last name"]).toBe("Lovelace");
    expect(rows[0]["Email address"]).toBe("ada@example.com");
  });

  it("builds AGS-shaped score lines", () => {
    const lines = toAgsScoreLines(learners, "urn:test");
    expect(lines[0].scoreGiven).toBe(88);
    expect(lines[0].scoreMaximum).toBe(100);
    expect(lines[0].lineItemId).toBe("urn:test");
    expect(lines[1].gradingProgress).toBe("Pending");
  });
});

import { describe, expect, it } from "vitest";
import {
  assessCompletion,
  buildCertificatePayload,
  hashCertificatePayload,
  verifyCertificateHash,
} from "@/lib/training/certificate";

describe("certificate eligibility", () => {
  it("requires all required tasks approved", () => {
    const result = assessCompletion({
      requiredTaskIds: ["a", "b"],
      taskStatus: { a: "approved", b: "submitted" },
    });
    expect(result.eligible).toBe(false);
    expect(result.missingRequired).toEqual(["b"]);
  });

  it("is eligible when all required done", () => {
    const result = assessCompletion({
      requiredTaskIds: ["a", "b"],
      taskStatus: { a: "approved", b: "completed" },
    });
    expect(result.eligible).toBe(true);
  });
});

describe("certificate hash", () => {
  it("hashes payload stably and verifies", async () => {
    const payload = buildCertificatePayload({
      programId: "prog-1",
      programName: "Camp",
      learnerId: "user-1",
      displayName: "Ada",
      completedTaskIds: ["b", "a"],
      requiredTaskIds: ["a", "b"],
      completedAt: "2026-07-18T00:00:00.000Z",
    });
    const hash = await hashCertificatePayload(payload);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifyCertificateHash(payload, hash)).toBe(true);
    expect(await verifyCertificateHash(payload, "0".repeat(64))).toBe(false);
  });
});

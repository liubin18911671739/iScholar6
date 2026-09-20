import { describe, expect, it } from "vitest";
import { getTrainingTaskDefinition, MVP_TRAINING_TASKS } from "@/lib/training/registry";

describe("MVP training registry", () => {
  it("contains the three demo tasks", () => {
    expect(MVP_TRAINING_TASKS).toHaveLength(8);
    expect(getTrainingTaskDefinition("evidence-verification")?.requiresReview).toBe(true);
  });
});

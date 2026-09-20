import { describe, expect, it } from "vitest";
import { listMvpTaskIds, trainingTaskTitle } from "@/lib/training/task-meta";

describe("training task meta", () => {
  it("resolves known task titles", () => {
    expect(trainingTaskTitle("research-question")).toContain("研究问题");
    expect(listMvpTaskIds()).toContain("evidence-verification");
  });

  it("falls back to task id for unknown tasks", () => {
    expect(trainingTaskTitle("unknown-task")).toBe("unknown-task");
  });
});

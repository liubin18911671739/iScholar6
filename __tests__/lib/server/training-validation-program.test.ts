import { describe, expect, it } from "vitest";
import {
  programRowFromInput,
  trainingMemberPatchSchema,
  trainingProgramPatchSchema,
  trainingProgramSchema,
} from "@/lib/server/training-validation";

describe("training program validation (T1 lifecycle)", () => {
  it("accepts full create payload", () => {
    const parsed = trainingProgramSchema.safeParse({
      name: "2026 Spring",
      description: "AI literacy camp",
      discipline: "HCI",
      cohortName: "A",
      startDate: "2026-03-01",
      endDate: "2026-06-30",
      maxMembers: 40,
      status: "active",
    });
    expect(parsed.success).toBe(true);
  });

  it("maps camelCase program fields to snake_case columns", () => {
    const row = programRowFromInput({
      name: "Camp",
      cohortName: "B1",
      startDate: "2026-01-01",
      maxMembers: 10,
      status: "draft",
    });
    expect(row).toMatchObject({
      name: "Camp",
      cohort_name: "B1",
      start_date: "2026-01-01",
      max_members: 10,
      status: "draft",
    });
  });

  it("requires at least one field on patch", () => {
    expect(trainingProgramPatchSchema.safeParse({}).success).toBe(false);
    expect(trainingProgramPatchSchema.safeParse({ status: "archived" }).success).toBe(true);
  });

  it("validates member patch", () => {
    expect(trainingMemberPatchSchema.safeParse({ status: "removed" }).success).toBe(true);
    expect(trainingMemberPatchSchema.safeParse({ role: "ta" }).success).toBe(true);
    expect(trainingMemberPatchSchema.safeParse({}).success).toBe(false);
  });
});

import { test, expect } from "@playwright/test";
import { authenticateLocally, createProject } from "./helpers/auth";

test.describe("AI Research Training Camp", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
  });

  test("creates a training camp and enrolls a learner", async ({ page }) => {
    await page.goto("/training/manage");
    await expect(
      page.getByRole("heading", { name: /训练营与班级管理|Training camps/i })
    ).toBeVisible();

    // Name field is the first labeled program input in the create form.
    await page.getByPlaceholder(/2026 春季|2026 Spring|training camp/i).fill("旅游传播 AI 科研训练营");
    await page.getByRole("button", { name: /^创建$|^Create$/i }).click();
    await expect(page.getByText("旅游传播 AI 科研训练营").first()).toBeVisible({
      timeout: 10_000,
    });

    await page
      .getByPlaceholder(/学员匿名|Anonymous learner|learner/i)
      .fill("learner-001");
    await page.getByRole("button", { name: /加入班级|Add to class/i }).click();
    await expect(page.getByText("learner-001", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows the coach task list and personal report", async ({ page }) => {
    await createProject(page, "Training Camp Project");
    await page.goto("/training");
    await expect(
      page.getByText(/AI科研教练|训练任务|MVP|research coach/i).first()
    ).toBeVisible({ timeout: 10_000 });

    await page.goto("/training/report");
    await expect(
      page.getByRole("heading", { name: /个人训练报告|Personal training report/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /导出 JSON|Export JSON/i })).toBeVisible();
  });

  test("certificate verify page is reachable", async ({ page }) => {
    await page.goto("/training/verify");
    await expect(
      page.getByRole("heading", { name: /结业证明校验|Verify completion certificate/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /校验|Verify/i })).toBeVisible();
  });
});

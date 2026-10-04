import { test, expect } from "@playwright/test";
import { authenticate, createProject } from "./helpers/auth";

test.describe("AI Research Training Camp", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
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

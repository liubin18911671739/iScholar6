import { test, expect } from "@playwright/test";
import { authenticateLocally, createProject } from "./helpers/auth";

test.describe("Module Assistant Chat", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
    await createProject(page, "Assistant Test Project");
  });

  test("side buttons are visible on module page", async ({ page }) => {
    await expect(page.getByLabel(/使用说明|User Manual/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/模块助手|Module Assistant/i)).toBeVisible({ timeout: 10_000 });
  });

  test("clicking help button opens user manual sheet", async ({ page }) => {
    await page.getByLabel(/使用说明|User Manual/i).click();
    await expect(page.getByText(/使用说明|user manual|how to|操作步骤/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("clicking chat button opens module assistant sheet", async ({ page }) => {
    await page.getByLabel(/模块助手|Module Assistant/i).click();
    await expect(page.getByText(/模块助手|assistant|hermes|对话/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("module assistant shows clear chat button", async ({ page }) => {
    await page.getByLabel(/模块助手|Module Assistant/i).click();
    await expect(page.getByRole("button", { name: /清空|clear/i }).first()).toBeVisible({
      timeout: 5000,
    });
  });
});

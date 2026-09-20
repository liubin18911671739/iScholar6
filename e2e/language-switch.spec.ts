import { test, expect } from "@playwright/test";
import { authenticateLocally } from "./helpers/auth";

test.describe("Language Switching", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
    await page.goto("/dashboard");
  });

  test("language toggle button is visible", async ({ page }) => {
    const langButton = page.getByTitle(/language/i);
    await expect(langButton).toBeVisible({ timeout: 5000 });
  });

  test("switching to English changes UI text", async ({ page }) => {
    const langButton = page.getByTitle(/language/i);
    await langButton.click();
    await page.getByRole("menuitem", { name: /english|en/i }).click();
    await expect(page.getByText(/dashboard|projects|settings/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("switching back to Chinese restores Chinese UI", async ({ page }) => {
    const langButton = page.getByTitle(/language/i);
    await langButton.click();
    await page.getByRole("menuitem", { name: /english|en/i }).click();
    await langButton.click();
    await page.getByRole("menuitem", { name: /中文|chinese|zh/i }).click();
    await expect(page.getByText(/仪表盘|项目|设置/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("language persists after page refresh", async ({ page }) => {
    const langButton = page.getByTitle(/language/i);
    await langButton.click();
    await page.getByRole("menuitem", { name: /english|en/i }).click();
    await page.reload();
    await expect(page.getByText(/dashboard|projects|settings/i).first()).toBeVisible({
      timeout: 5000,
    });
  });
});

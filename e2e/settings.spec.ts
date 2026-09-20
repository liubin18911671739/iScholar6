import { test, expect } from "@playwright/test";
import { authenticateLocally } from "./helpers/auth";

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
  });

  test("settings page loads with correct sections", async ({ page }) => {
    await page.goto("/settings");
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible({ timeout: 5000 });
    const passwordSection = page.getByText(/password|密码/i).first();
    await expect(passwordSection).toBeVisible({ timeout: 5000 });
  });

  test("password change form is present with fields", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("#current-password, #currentPassword, input[type='password']").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("export button is clickable", async ({ page }) => {
    await page.goto("/settings");
    const exportBtn = page.getByRole("button", { name: /export|导出|备份/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await expect(exportBtn).toBeEnabled();
  });
});

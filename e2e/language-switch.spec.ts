import { test, expect, type Page } from "@playwright/test";
import { authenticate } from "./helpers/auth";

/** Open the language dropdown, pick an option, and wait for it to close. */
async function switchLanguage(page: Page, name: RegExp) {
  await page.getByTitle(/language/i).click();
  const item = page.getByRole("menuitem", { name });
  await expect(item).toBeVisible({ timeout: 5000 });
  await item.click();
  await expect(item).toBeHidden({ timeout: 5000 });
}

test.describe("Language Switching", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
    await page.goto("/dashboard");
  });

  test("language toggle button is visible", async ({ page }) => {
    await expect(page.getByTitle(/language/i)).toBeVisible({ timeout: 5000 });
  });

  test("switching to English changes UI text", async ({ page }) => {
    await switchLanguage(page, /english|en/i);
    await expect(page.getByText(/dashboard|projects|settings/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("switching back to Chinese restores Chinese UI", async ({ page }) => {
    await switchLanguage(page, /english|en/i);
    await expect(page.getByText(/dashboard|projects|settings/i).first()).toBeVisible({
      timeout: 5000,
    });
    await switchLanguage(page, /中文|chinese|zh/i);
    await expect(page.getByText(/仪表盘|项目|设置/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("language persists after page refresh", async ({ page }) => {
    await switchLanguage(page, /english|en/i);
    await page.reload();
    await expect(page.getByText(/dashboard|projects|settings/i).first()).toBeVisible({
      timeout: 5000,
    });
  });
});

import { test, expect } from "@playwright/test";
import { resetBrowserState } from "./helpers/auth";

test.describe("Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetBrowserState(page);
  });

  test("first-time setup: shows password creation form", async ({ page }) => {
    await page.goto("/login");
    // Local mode only — no collaborative email field.
    await expect(page.locator("#email")).toHaveCount(0);
    await expect(page.getByText(/设置密码|set.*password|create.*password/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("#confirm")).toBeVisible();
  });

  test("first-time setup: can set password and redirect to dashboard", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.locator("#password").fill("TestPass1");
    await page.locator("#confirm").fill("TestPass1");
    await page.getByRole("button", { name: /创建密码并进入|创建密码|set|create/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|projects)/, { timeout: 15_000 });
  });

  test("return login: shows unlock form after password is set", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#password").fill("TestPass1");
    await page.locator("#confirm").fill("TestPass1");
    await page.getByRole("button", { name: /创建密码并进入|创建密码|set|create/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|projects)/, { timeout: 15_000 });

    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/login");

    await expect(page.getByText(/解锁|unlock|enter.*password/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("#confirm")).toHaveCount(0);
  });

  test("wrong password shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#password").fill("CorrectPass1");
    await page.locator("#confirm").fill("CorrectPass1");
    await page.getByRole("button", { name: /创建密码并进入|创建密码|set|create/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|projects)/, { timeout: 15_000 });

    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/login");

    await page.locator("#password").fill("WrongPass1");
    await page.getByRole("button", { name: /解锁|unlock/i }).click();

    await expect(page.getByText(/密码错误|incorrect|invalid|wrong/i)).toBeVisible({
      timeout: 5000,
    });
  });
});

import { test, expect } from "@playwright/test";
import { E2E_STAFF, login, resetBrowserState } from "./helpers/auth";

test.describe("Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetBrowserState(page);
  });

  test("unauthenticated access redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("valid credentials redirect to an authenticated page", async ({ page }) => {
    await login(page, E2E_STAFF);
    await expect(page).toHaveURL(/\/(dashboard|projects)/, { timeout: 15_000 });
  });

  test("invalid credentials show an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(E2E_STAFF.email);
    await page.locator("#password").fill("WrongPass1");
    await page.getByRole("button", { name: /登录|sign in|log in/i }).click();

    await expect(
      page.getByText(/邮箱或密码不正确|invalid|incorrect|wrong/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});

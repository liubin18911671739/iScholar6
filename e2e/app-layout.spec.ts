import { test, expect } from "@playwright/test";
import { authenticateLocally, loginLocally, resetBrowserState } from "./helpers/auth";

test.describe("App Layout", () => {
  test("unauthenticated user is redirected to login", async ({ page }) => {
    await resetBrowserState(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("authenticated user sees sidebar navigation", async ({ page }) => {
    await loginLocally(page);
    await page.goto("/dashboard");
    await expect(page.getByText(/TopicScout|LitReview|Research|选题|综述/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("logout redirects to login", async ({ page }) => {
    await authenticateLocally(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /锁定|lock/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

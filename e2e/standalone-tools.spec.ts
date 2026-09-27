import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers/auth";

test.describe("Standalone Tools", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("tools page shows 3 tool cards", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText(/独立工具|standalone tools/i)).toBeVisible({ timeout: 5000 });
  });
});

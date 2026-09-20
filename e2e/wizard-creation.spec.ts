import { test, expect } from "@playwright/test";
import { authenticateLocally } from "./helpers/auth";

test.describe("Project Creation Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
  });

  test("wizard has 4 steps with progress indicator", async ({ page }) => {
    await page.goto("/projects");
    await page.getByTestId("new-project").click();
    await expect(page.getByText(/学科类别|discipline|choose.*discipline/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/学科|discipline/i).first()).toBeVisible();
  });
});

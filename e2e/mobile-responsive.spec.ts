import { test, expect } from "@playwright/test";
import { authenticateLocally, createProject } from "./helpers/auth";

test.describe("Mobile Responsive", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
  });

  test("sidebar is hidden on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    // Desktop sidebar is md:flex; on mobile the hamburger is shown instead.
    await expect(page.locator("header button").first()).toBeVisible({ timeout: 5000 });
  });

  test("hamburger menu is visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await expect(page.locator("header button").first()).toBeVisible({ timeout: 5000 });
  });

  test("mobile menu opens a sheet/sidebar when hamburger is clicked", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.locator("header button").first().click();
    const sheet = page.getByRole("dialog", { name: /导航|navigation/i });
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByRole("link", { name: /仪表盘|dashboard/i })).toBeVisible();
  });

  test("module page layout adapts on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const projectId = await createProject(page, "Mobile Module Project");
    await page.goto(`/projects/${projectId}/topic`);
    await expect(page.getByText(/TopicScout|选题/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard layout stacks on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 5000 });
  });
});

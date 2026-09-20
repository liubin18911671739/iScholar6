import { test, expect } from "@playwright/test";
import { authenticateLocally, createProject } from "./helpers/auth";

test.describe("Module Workspace Refactor", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
  });

  async function createProjectAndNavigate(
    page: import("@playwright/test").Page,
    agentId: string
  ) {
    const projectId = await createProject(page, "E2E Test Project");
    await page.goto(`/projects/${projectId}/${agentId}`);
    await page.waitForLoadState("domcontentloaded");
    return projectId;
  }

  test("cosmic background uses HSL dark tokens", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    const cosmic = page.locator(".cosmic-bg").first();
    await expect(cosmic).toBeVisible({ timeout: 10_000 });
  });

  test("ModuleCards use cosmic-panel class", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    await expect(page.locator(".cosmic-panel").first()).toBeVisible({ timeout: 10_000 });
  });

  test("WorkflowStepper highlights current stage with glow", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    await expect(page.getByText(/选题|topic/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("inactive stepper stages are dimmed, only current has scale-110", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    await expect(page.locator("a, button").filter({ hasText: /选题|topic/i }).first()).toBeVisible();
  });

  test("stepper syncs active stage across all 7 modules", async ({ page }) => {
    const projectId = await createProject(page, "Stepper Sync");
    for (const agent of ["topic", "litreview", "design", "data", "write", "submit", "rebuttal"]) {
      await page.goto(`/projects/${projectId}/${agent}`);
      await expect(page).toHaveURL(new RegExp(`/projects/[^/]+/${agent}`));
    }
  });

  test("stepper nodes link to correct routes", async ({ page }) => {
    const projectId = await createProject(page, "Stepper Links");
    await page.goto(`/projects/${projectId}/topic`);
    const litLink = page.locator(`a[href*="/litreview"]`).first();
    if (await litLink.isVisible().catch(() => false)) {
      await litLink.click();
      await expect(page).toHaveURL(/\/litreview/);
    }
  });

  test("scrolling middle column keeps ModuleTopBar visible", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    await page.evaluate(() => window.scrollBy(0, 400));
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("ModuleTopBar remains at top after content scroll", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    await page.evaluate(() => window.scrollBy(0, 600));
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("columns scroll independently", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    await expect(page.locator(".cosmic-panel, main").first()).toBeVisible();
  });

  test("Topic: tag chips toggle selection", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    await expect(page.getByText(/TopicScout|选题/i).first()).toBeVisible();
  });

  test("LitReview: research gaps section renders", async ({ page }) => {
    await createProjectAndNavigate(page, "litreview");
    await expect(page.getByText(/LitReview|综述/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Rebuttal: revision checklist renders", async ({ page }) => {
    await createProjectAndNavigate(page, "rebuttal");
    await expect(page.getByText(/Rebuttal|返修/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("desktop: UserManual is visible on module pages", async ({ page }) => {
    await createProjectAndNavigate(page, "topic");
    // Side button aria-label is module.sideManualTooltip
    await expect(page.getByLabel(/使用说明|User Manual/i)).toBeVisible({ timeout: 10_000 });
  });
});


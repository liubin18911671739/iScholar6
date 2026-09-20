import { test, expect } from "@playwright/test";
import { authenticateLocally, createProject } from "./helpers/auth";

test.describe("Agent Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
  });

  test("can create a project and navigate to agent page", async ({ page }) => {
    await createProject(page, "Test Research Project");
    await expect(page.getByText(/TopicScout|选题/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("agent page shows input fields and Run button", async ({ page }) => {
    const projectId = await createProject(page, "Run Button Project");
    await page.goto(`/projects/${projectId}/topic`);
    // Topic agent primary action is module.action.topic ("生成候选选题"), not generic "运行".
    await expect(page.getByRole("button", { name: /生成候选选题|generate.*topic/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

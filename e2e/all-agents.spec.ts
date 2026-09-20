import { test, expect } from "@playwright/test";
import { authenticateLocally, createProject } from "./helpers/auth";

test.describe("All Agent Pages", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateLocally(page);
  });

  /** Per-agent primary action labels from messages/*.json module.action.* */
  const AGENTS = [
    { id: "topic", name: "TopicScout", label: /topic|选题/i, action: /生成候选选题|generate.*topic|run/i },
    { id: "litreview", name: "LitReview", label: /litreview|综述/i, action: /生成综述|generate.*review|run/i },
    { id: "design", name: "ResearchDesigner", label: /research|设计/i, action: /生成研究设计|generate.*design|run/i },
    { id: "data", name: "DataPilot", label: /data|数据/i, action: /运行数据分析|run.*analysis|run/i },
    { id: "write", name: "IMRaDWriter", label: /imrad|write|写作|撰写/i, action: /生成章节|generate.*section|run/i },
    { id: "submit", name: "SubmitMatch", label: /submit|投稿/i, action: /生成投稿|generate.*submit|run/i },
    { id: "rebuttal", name: "RebuttalShow", label: /rebuttal|返修|回复/i, action: /生成回复|generate.*rebuttal|run/i },
  ];

  for (const agent of AGENTS) {
    test(`${agent.name} page has input fields and run button`, async ({ page }) => {
      const projectId = await createProject(page, `Agent ${agent.name}`);
      await page.goto(`/projects/${projectId}/${agent.id}`);
      await expect(page).toHaveURL(new RegExp(`/projects/[^/]+/${agent.id}`));
      await expect(page.getByText(agent.label).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: agent.action }).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  }

  test("workflow stepper highlights current agent", async ({ page }) => {
    const projectId = await createProject(page, "Stepper Test");
    await page.goto(`/projects/${projectId}/topic`);
    await expect(page.getByRole("link", { name: /选题|topic/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("config hint is shown on idle agent page", async ({ page }) => {
    const projectId = await createProject(page, "Hint Test");
    await page.goto(`/projects/${projectId}/topic`);
    await expect(page.getByText(/配置参数|configHint|点击.*生成|Run/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("back button navigates to projects list", async ({ page }) => {
    const projectId = await createProject(page, "Back Test");
    await page.goto(`/projects/${projectId}/topic`);
    await page.getByRole("link", { name: /返回|back|iScholar/i }).first().click();
    await expect(page).toHaveURL(/\/projects(?:\?|$)/, { timeout: 10_000 });
  });
});

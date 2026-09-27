import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers/auth";

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("settings page loads with correct sections", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/存储|storage/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/MCP/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("agent language selector is present", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/智能体语言|agent language/i).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("button", { name: /自动|auto/i }).first()).toBeVisible();
  });

  test("mcp tools section is rendered", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/MCP工具|MCP tools/i).first()).toBeVisible({ timeout: 5000 });
  });
});

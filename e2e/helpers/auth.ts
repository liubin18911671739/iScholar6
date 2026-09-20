import { expect, type Page } from "@playwright/test";

/** Clear browser storage used by local auth and IndexedDB. */
export async function resetBrowserState(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("ischolar-v6-local");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.reload();
}

/**
 * First-time local password setup (or unlock if a hash already exists).
 * Assumes NEXT_PUBLIC_COLLABORATIVE_MODE=false on the Playwright webServer.
 */
export async function loginLocally(page: Page, password = "TestPass1") {
  await resetBrowserState(page);
  await page.goto("/login");

  // Guard: collaborative email form must not appear in the default suite.
  await expect(page.locator("#email")).toHaveCount(0);
  const passwordInput = page.locator("#password");
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  const confirm = page.locator("#confirm");
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.fill(password);
  }

  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(dashboard|projects)/, { timeout: 15_000 });
}

/**
 * Seed local auth + session without going through the form.
 * Prefer this in beforeEach for speed once local mode is guaranteed.
 */
export async function authenticateLocally(page: Page, password = "TestPass1") {
  await page.goto("/login");
  await page.evaluate(async (value) => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("ischolar-v6-local");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    const salt = "e2e-test-salt";
    const bytes = new TextEncoder().encode(salt + value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("ischolar_auth_salt", salt);
    localStorage.setItem("ischolar_auth_hash", hash);
    sessionStorage.setItem(
      "ischolar_auth_session",
      JSON.stringify({ authenticated: true, createdAt: Date.now() })
    );
  }, password);
  // Land on an authenticated shell page so subsequent UI actions work.
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });
  await expect(page.getByTestId("new-project")).toBeVisible({ timeout: 15_000 });
}

export async function createProject(page: Page, name = "E2E Test Project") {
  await page.goto("/projects");
  if (page.url().includes("/login")) {
    await loginLocally(page);
    await page.goto("/projects");
  }

  await expect(page.getByTestId("new-project")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("new-project").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Option cards embed title + description in the accessible name
  // (e.g. "社科 社会科学：教育学…"), so use substring match — not /^社科$/.
  await dialog.getByRole("button", { name: /社科|social sciences/i }).first().click();
  await dialog.getByRole("button", { name: /^下一步$|^next$/i }).click();

  await dialog.getByRole("button", { name: /定性|qualitative/i }).first().click();
  await dialog.getByRole("button", { name: /^下一步$|^next$/i }).click();

  // Step 3: optional direction — skip
  await dialog.getByRole("button", { name: /^下一步$|^next$/i }).click();

  // Step 4: name + create
  await expect(dialog.getByTestId("project-name")).toBeVisible();
  await dialog.getByTestId("project-name").fill(name);
  await dialog.getByTestId("create-project").click();

  await expect(page).toHaveURL(/\/projects\/[^/]+\/topic/, { timeout: 15_000 });
  const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1] ?? "";
  expect(projectId.length).toBeGreaterThan(0);
  return projectId;
}

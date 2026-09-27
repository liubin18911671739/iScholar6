import { expect, type Page } from "@playwright/test";

import { E2E_LEARNER, E2E_STAFF } from "./credentials";

export { E2E_LEARNER, E2E_STAFF };

type E2EUser = { email: string; password: string };

/** Clear cookies plus browser storage (locale / IndexedDB caches). */
export async function resetBrowserState(page: Page) {
  await page.context().clearCookies();
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
}

/** Sign in through the Auth.js credentials form. */
export async function login(page: Page, user: E2EUser = E2E_STAFF) {
  await page.goto("/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: /登录|sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|projects)/, { timeout: 15_000 });
}

/**
 * Programmatic Auth.js credentials sign-in (fast path for `beforeEach`).
 * Fetches a CSRF token, posts to the credentials callback so the session
 * cookie lands in the browser context, then lands on an authenticated page.
 */
export async function authenticate(page: Page, user: E2EUser = E2E_STAFF) {
  await page.context().clearCookies();
  const csrfResponse = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/credentials", {
    form: {
      email: user.email,
      password: user.password,
      csrfToken,
      callbackUrl: "/dashboard",
    },
    maxRedirects: 0,
  });

  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });
  await expect(page.getByTestId("new-project")).toBeVisible({ timeout: 15_000 });
}

export async function createProject(page: Page, name = "E2E Test Project") {
  await page.goto("/projects");
  if (page.url().includes("/login")) {
    await authenticate(page);
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

import { defineConfig, devices } from "@playwright/test";

/**
 * Standard E2E runs against local-password mode only.
 * Collaborative Supabase browser E2E is opt-in via REAL_SUPABASE_E2E=true.
 *
 * Use a dedicated port (3100) and never reuse an existing dev server, so a
 * developer machine with NEXT_PUBLIC_COLLABORATIVE_MODE=true on :3000 cannot
 * poison the suite.
 */
const isRealSupabaseE2E = process.env.REAL_SUPABASE_E2E === "true";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const port = new URL(baseURL).port || "3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial workers avoid intermittent dialog/IndexedDB races across files.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Keep real Supabase browser E2E opt-in only.
  testIgnore: isRealSupabaseE2E ? undefined : [/supabase-collaboration\.spec\.ts/],
  use: {
    baseURL,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -H 127.0.0.1 -p ${port}`,
    url: baseURL,
    // Always start a controlled server with the env below.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      // Force local-only auth for the default suite. Real Supabase E2E flips this on.
      // Must override a developer shell / .env with COLLABORATIVE_MODE=true.
      NEXT_PUBLIC_COLLABORATIVE_MODE: isRealSupabaseE2E ? "true" : "false",
      REAL_SUPABASE_E2E: isRealSupabaseE2E ? "true" : "false",
    },
  },
});

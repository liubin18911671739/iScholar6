/**
 * Shared E2E credentials + DB URL derivation.
 *
 * Used by both the Playwright global setup (seeding Auth.js users) and the
 * auth helpers. Playwright does not load `.env` on its own, so `loadDotEnv`
 * parses it before deriving the host-reachable database URL.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Seeded staff account (global librarian) used by most specs. */
export const E2E_STAFF = {
  email: "e2e-staff@ischolar.test",
  password: "TestPass1",
  name: "E2E Staff",
  role: "librarian",
} as const;

/** Seeded learner account for learner-scoped flows. */
export const E2E_LEARNER = {
  email: "e2e-learner@ischolar.test",
  password: "TestPass1",
  name: "E2E Learner",
  role: "learner",
} as const;

/** Minimal `.env` parser (does not override existing env vars). */
export function loadDotEnv(path = resolve(process.cwd(), ".env")): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Resolve a host-reachable Auth DB URL. The compose `.env` points at the
 * `postgres` service host (only resolvable inside Docker); rewrite it to
 * `127.0.0.1:${POSTGRES_PORT}` for host-run Playwright.
 */
export function e2eAuthDatabaseUrl(): string {
  loadDotEnv();
  const raw = process.env.E2E_AUTH_DATABASE_URL || process.env.AUTH_DATABASE_URL;
  const fallback = `postgresql://ischolar:ischolar@127.0.0.1:${process.env.POSTGRES_PORT ?? "5432"}/ischolar`;
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.hostname === "postgres" || url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      if (process.env.POSTGRES_PORT) url.port = process.env.POSTGRES_PORT;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

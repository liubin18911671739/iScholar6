#!/usr/bin/env node
/**
 * Full quality gate orchestrator (local).
 *
 * Runs: lint → vitest → build → e2e.
 *
 * Usage:
 *   node scripts/quality-gate.mjs
 */

import { spawnSync } from "node:child_process";

function run(label, command, env = {}) {
  console.log(`\n==> ${label}\n$ ${command}`);
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\nQuality gate failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

// Best-effort step: never abort the gate on failure (e.g. Docker not running).
function runOptional(label, command, env = {}) {
  console.log(`\n==> ${label} (optional)\n$ ${command}`);
  const result = spawnSync(command, { shell: true, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.warn(`\n[warn] ${label} failed — continuing. E2E will report if Postgres is unreachable.`);
  }
}

run("lint", "pnpm lint");
run("vitest", "pnpm vitest run");

// Best-effort Python-side regression (needs `uv` + a venv; checkmarks the
// backend/eval suites without making Docker a hard prerequisite here).
runOptional(
  "backend pytest + ruff",
  "cd services/backend && uv run ruff check app tests && uv run pytest -q"
);
runOptional(
  "eval pytest + ruff",
  "cd services/eval && uv run ruff check . && uv run pytest -q"
);
runOptional("agent eval offline", "pnpm agent:eval");
// Desktop client unit tests (stdlib unittest; PYTHONPATH points at src/).
runOptional("desktop unittest", "cd desktop && python3 -m unittest discover -s tests", {
  PYTHONPATH: "src",
});

run("build", "pnpm build");

// E2E authenticates through Auth.js credentials, which needs the compose
// Postgres reachable from the host. Bring it up (best-effort) before Playwright.
runOptional("ensure postgres", "docker compose up -d --wait postgres");

run("e2e", "pnpm test:e2e");

console.log("\nAll requested quality gates passed.");

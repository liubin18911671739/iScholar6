#!/usr/bin/env node
/**
 * Full quality gate orchestrator (local).
 *
 * Runs: lint → vitest → build → e2e (optional flags for remote checks).
 *
 * Usage:
 *   node scripts/quality-gate.mjs
 *   node scripts/quality-gate.mjs --with-supabase
 *   node scripts/quality-gate.mjs --with-real-e2e
 */

import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const withSupabase = args.has("--with-supabase");
const withRealE2E = args.has("--with-real-e2e");

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

run("lint", "pnpm lint");
run("vitest", "pnpm vitest run");
run("build", "pnpm build");
run("e2e", "pnpm test:e2e");

if (withSupabase) {
  run("supabase schema lint", "node scripts/lint-supabase-schema.mjs");
  run("supabase simulation acceptance", "node scripts/simulate-real-acceptance.mjs");
}

if (withRealE2E) {
  run("real supabase browser e2e", "pnpm playwright test e2e/supabase-collaboration.spec.ts", {
    REAL_SUPABASE_E2E: "true",
  });
}

console.log("\nAll requested quality gates passed.");

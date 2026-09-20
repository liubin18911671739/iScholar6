#!/usr/bin/env node
/**
 * Controlled remote schema check for collaborative mode.
 *
 * Uses the service-role key (server-only) via PostgREST to verify expected
 * tables are reachable. Prefer this when `supabase db lint` cannot connect
 * because the DB password is not available in the local env.
 *
 * Usage:
 *   set -a; . ./.env; set +a
 *   node scripts/lint-supabase-schema.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const EXPECTED_TABLES = [
  "profiles",
  "training_programs",
  "training_enrollments",
  "training_submissions",
  "training_reviews",
  "ai_consents",
  "training_tasks",
  "evidence_cards",
  "training_program_tasks",
  "training_task_packs",
  "training_task_definitions",
  "training_certificates",
  "training_peer_assignments",
  "training_peer_reviews",
  "organizations",
  "organization_members",
  "training_lms_links",
  "projects",
  "manuscripts",
  "manuscript_blocks",
  "manuscript_versions",
  "bib_items",
  "attachments",
  "rag_chunks",
  "experiments",
  "submissions",
  "review_rounds",
  "rebuttal_items",
  "agent_runs",
  "audit_ledger",
  "tasks",
];

const migrationDir = join(process.cwd(), "supabase/migrations");
const migrations = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();

console.log(JSON.stringify({ migrations }, null, 2));

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const missing = [];
const ok = [];

for (const table of EXPECTED_TABLES) {
  const { error } = await admin.from(table).select("*", { head: true, count: "exact" }).limit(1);
  if (error) {
    // PGRST205 = table not in schema cache / missing; other errors may still mean table exists (e.g. RLS).
    const code = error.code ?? "";
    const message = error.message ?? "";
    if (code === "PGRST205" || /could not find the table/i.test(message) || /relation .* does not exist/i.test(message)) {
      missing.push({ table, code, message });
    } else {
      // Table is present enough for PostgREST to address it.
      ok.push({ table, note: "reachable", code, message });
    }
  } else {
    ok.push({ table, note: "ok" });
  }
}

// Static lint: migrations should mention each expected table at least once.
const migrationText = migrations
  .map((name) => readFileSync(join(migrationDir, name), "utf8"))
  .join("\n");
const unmentioned = EXPECTED_TABLES.filter((table) => !new RegExp(`\\b${table}\\b`).test(migrationText));

const report = {
  migrationCount: migrations.length,
  tablesChecked: EXPECTED_TABLES.length,
  reachable: ok.length,
  missing,
  unmentionedInMigrations: unmentioned,
};

console.log(JSON.stringify(report, null, 2));

if (missing.length || unmentioned.length) {
  console.error("Schema lint failed");
  process.exit(1);
}

console.log("Schema lint passed");

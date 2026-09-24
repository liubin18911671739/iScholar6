/**
 * Collaborative (lib/supabase/collaborative.ts)
 *
 * Functionality:
 * - Provides the browser Supabase client and auth-header helpers for collaborative features.
 * - Syncs local agent runs and mutations to remote tables via API routes / Supabase.
 * - Requires an authenticated user for guarded operations.
 *
 * Side effects:
 * - Performs network fetches to `/api/agent-runs` and upserts/deletes remote Supabase rows.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createSupabaseBrowserClient } from "./browser";
import type { LocalAgentRun } from "@/lib/local/db";
import { DEXIE_TO_REMOTE_TABLE, toRemoteRecord } from "./field-map";

/**
 * Whether Supabase collaborative features are enabled.
 *
 * Env-driven (`NEXT_PUBLIC_COLLABORATIVE_MODE=true`), matching Playwright and
 * the legacy browser-local mode. The target platform removes this entirely.
 */
export function isCollaborativeMode() {
  return process.env.NEXT_PUBLIC_COLLABORATIVE_MODE === "true";
}

/** Return the browser Supabase client used for collaborative features. */
export function getCollaborativeClient() {
  return createSupabaseBrowserClient();
}

/** Build an Authorization header from the current Supabase session, if any. */
export async function getCollaborativeAuthHeaders(): Promise<Record<string, string>> {
  const client = getCollaborativeClient();
  if (!client) return {};
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Require an authenticated user plus client, throwing when unauthenticated. */
export async function requireCollaborativeUser() {
  const client = getCollaborativeClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
  return { client, user: data.user };
}

/** Persist a local agent run to the remote API. */
export async function syncAgentRun(run: LocalAgentRun) {
  const response = await fetch("/api/agent-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getCollaborativeAuthHeaders()) },
    body: JSON.stringify({ run }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new Error(payload?.error ?? "AGENT_RUN_SYNC_FAILED");
  }
}

/** Patch a remote agent run by id. */
export async function updateRemoteAgentRun(id: string, patch: Partial<LocalAgentRun>) {
  const response = await fetch("/api/agent-runs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await getCollaborativeAuthHeaders()) },
    body: JSON.stringify({ id, patch }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new Error(payload?.error ?? "AGENT_RUN_UPDATE_FAILED");
  }
}

/** Mirror a local Dexie mutation to its mapped remote table, best-effort. */
export async function syncLocalMutation(table: string, row: Record<string, unknown>, operation: "upsert" | "delete") {
  const remoteTable = DEXIE_TO_REMOTE_TABLE[table];
  if (!remoteTable) return;
  const client = getCollaborativeClient();
  if (!client) return;
  const query = client.from(remoteTable);
  const id = row.id;
  if (operation === "delete") {
    const { error } = await query.delete().eq("id", id);
    if (error) console.error(`Supabase sync delete ${remoteTable} failed`, error);
    return;
  }
  const remote = toRemoteRecord(row);
  if (table === "projects") {
    const { data } = await client.auth.getUser();
    if (!data.user) return;
    remote.owner_id = data.user.id;
  }
  const { error } = await query.upsert(remote);
  if (error) console.error(`Supabase sync upsert ${remoteTable} failed`, error);
}

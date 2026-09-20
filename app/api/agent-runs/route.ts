/**
 * Agent Runs Sync API (/api/agent-runs)
 *
 * Functionality:
 * - POST upserts a locally recorded agent run into the `agent_runs` table after auth and project-ownership checks.
 * - PATCH applies a partial update to an existing run after verifying ownership of its parent project.
 * - Both handlers require an authenticated user and a configured Supabase service-role client.
 *
 * Notes:
 * - Auto-creates placeholder `projects` rows when a run references a project that does not exist yet.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import type { LocalAgentRun } from "@/lib/local/db";
import { createServiceSupabaseClient, jsonError, requireApiUser } from "@/lib/server/request-guards";

/** Maps a local agent run into its snake_case database row shape. */
function agentRunRow(run: LocalAgentRun) {
  return {
    id: run.id,
    project_id: run.projectId,
    agent: run.agent,
    status: run.status,
    inputs: run.inputs,
    outputs: run.outputs,
    model_name: run.modelName,
    token_in: run.tokenIn,
    token_out: run.tokenOut,
    cost_cents: run.costCents,
    latency_ms: run.latencyMs,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    mode: run.mode,
    training_task_id: run.trainingTaskId,
    consent_id: run.consentId,
  };
}

/** Maps camelCase run fields to their database column names for PATCH updates. */
const PATCH_KEYS: Record<string, string> = {
  projectId: "project_id",
  trainingTaskId: "training_task_id",
  consentId: "consent_id",
  modelName: "model_name",
  tokenIn: "token_in",
  tokenOut: "token_out",
  costCents: "cost_cents",
  latencyMs: "latency_ms",
  startedAt: "started_at",
  endedAt: "ended_at",
};

/** Translates a partial local run patch into database column keys. */
function patchRow(patch: Partial<LocalAgentRun>) {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [PATCH_KEYS[key] ?? key, value]));
}

/** Verifies project ownership for the user, auto-creating a placeholder project when absent. */
async function ensureOwnedProject(
  client: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  projectId: string,
  userId: string
) {
  // Look up the existing project owner before allowing the write.
  const { data, error } = await client
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (data?.owner_id && data.owner_id !== userId) return false;
  if (data?.id) return true;

  // Recreate a missing project row so the run has a valid parent.
  const timestamp = new Date().toISOString();
  const { error: insertError } = await client.from("projects").insert({
    id: projectId,
    owner_id: userId,
    name: projectId.startsWith("__tool_") ? "Tool Run" : "Recovered Project",
    status: projectId.startsWith("__tool_") ? "archived" : "draft",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (insertError) throw insertError;
  return true;
}

/** Upserts a locally recorded agent run for the authenticated user. */
export async function POST(req: NextRequest) {
  try {
    // Reject unauthenticated requests and require the service-role client.
    const auth = await requireApiUser(req);
    if (!auth.ok || !auth.userId) return jsonError("UNAUTHENTICATED", 401);
    const client = createServiceSupabaseClient();
    if (!client) return jsonError("SUPABASE_SERVICE_ROLE_KEY_REQUIRED", 503);

    // Validate the incoming run payload before touching the database.
    const body = await req.json();
    const run = body?.run as LocalAgentRun | undefined;
    if (!run?.id || !run.projectId || !run.agent || !run.status || !run.startedAt) {
      return jsonError("INVALID_AGENT_RUN", 400);
    }

    // Ensure the caller owns (or can claim) the parent project.
    const allowed = await ensureOwnedProject(client, run.projectId, auth.userId);
    if (!allowed) return jsonError("FORBIDDEN_PROJECT", 403);

    // Upsert by id so client retries remain idempotent.
    const { error } = await client.from("agent_runs").upsert(agentRunRow(run));
    if (error) return jsonError(error.message, 400);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AGENT_RUN_SYNC_FAILED";
    console.error("[agent-runs] POST failed", error);
    return jsonError(message, 500);
  }
}

/** Applies a partial update to an existing agent run. */
export async function PATCH(req: NextRequest) {
  try {
    // Reject unauthenticated requests and require the service-role client.
    const auth = await requireApiUser(req);
    if (!auth.ok || !auth.userId) return jsonError("UNAUTHENTICATED", 401);
    const client = createServiceSupabaseClient();
    if (!client) return jsonError("SUPABASE_SERVICE_ROLE_KEY_REQUIRED", 503);

    // Validate the target id and patch object.
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const patch = body?.patch as Partial<LocalAgentRun> | undefined;
    if (!id || !patch || typeof patch !== "object") return jsonError("INVALID_AGENT_RUN_PATCH", 400);

    // Load the run to check ownership of its parent project.
    const { data: run, error: runError } = await client
      .from("agent_runs")
      .select("id, project_id")
      .eq("id", id)
      .maybeSingle();
    if (runError) throw runError;
    if (!run?.project_id) return jsonError("AGENT_RUN_NOT_FOUND", 404);

    // Reject writes to projects the caller does not own.
    const allowed = await ensureOwnedProject(client, run.project_id, auth.userId);
    if (!allowed) return jsonError("FORBIDDEN_PROJECT", 403);

    // Apply the translated patch to the target run.
    const { error } = await client.from("agent_runs").update(patchRow(patch)).eq("id", id);
    if (error) return jsonError(error.message, 400);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AGENT_RUN_UPDATE_FAILED";
    console.error("[agent-runs] PATCH failed", error);
    return jsonError(message, 500);
  }
}

/**
 * AI Consents API (/api/ai/consents)
 *
 * Functionality:
 * - POST records a redaction consent row in the `ai_consents` table for the authenticated user.
 * - Validates the required id, project, external services, redaction flag, and consent timestamp.
 * - Requires `programId` when the purpose is `training_submit` for camp audit.
 *
 * Notes:
 * - Falls back to a minimal column set when the remote database has not applied migration 007.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createApiSupabaseClient, requireApiUser } from "@/lib/server/request-guards";
import { isMissingColumnError } from "@/lib/server/schema-compat";

/** Allowed consent purposes recorded in the audit trail. */
const PURPOSES = new Set(["agent_run", "training_submit", "mcp_tool", "export"]);

/** Records an AI consent record for the authenticated user. */
export async function POST(req: NextRequest) {
  // Require Supabase configuration and an authenticated user.
  const client = createApiSupabaseClient(req);
  if (!client) {
    console.error("[ai-consents] Supabase not configured");
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireApiUser(req);
  if (!auth.ok || !auth.userId) {
    return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  // Validate the required consent fields before persisting.
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.projectId !== "string" ||
    !Array.isArray(body.externalServices) ||
    body.externalServices.length === 0 ||
    body.externalServices.length > 10 ||
    body.redactionConfirmed !== true ||
    typeof body.consentedAt !== "string"
  ) {
    return Response.json({ ok: false, error: "INVALID_CONSENT" }, { status: 400 });
  }

  // Normalize optional consent metadata to safe defaults.
  const purpose =
    typeof body.purpose === "string" && PURPOSES.has(body.purpose) ? body.purpose : "agent_run";
  const programId = typeof body.programId === "string" && body.programId ? body.programId : null;
  const trainingTaskId =
    typeof body.trainingTaskId === "string" && body.trainingTaskId ? body.trainingTaskId : null;
  const dataCategories = Array.isArray(body.dataCategories)
    ? body.dataCategories.filter((c: unknown) => typeof c === "string").slice(0, 20)
    : [];
  const sensitiveScan =
    body.sensitiveScan && typeof body.sensitiveScan === "object"
      ? {
          total: Number((body.sensitiveScan as { total?: number }).total) || 0,
          byCategory:
            (body.sensitiveScan as { byCategory?: Record<string, number> }).byCategory &&
            typeof (body.sensitiveScan as { byCategory?: unknown }).byCategory === "object"
              ? (body.sensitiveScan as { byCategory: Record<string, number> }).byCategory
              : {},
        }
      : { total: 0, byCategory: {} };

  // Training submit consent must be tied to a program for camp audit.
  if (purpose === "training_submit" && !programId) {
    return Response.json({ ok: false, error: "PROGRAM_ID_REQUIRED" }, { status: 400 });
  }

  // Try full upsert first; fall back to minimal columns when remote lags migrations.
  const fullPayload: Record<string, unknown> = {
    id: body.id,
    user_id: auth.userId,
    project_id: body.projectId,
    program_id: programId,
    training_task_id: trainingTaskId,
    purpose,
    data_categories: dataCategories,
    external_services: body.externalServices,
    redaction_confirmed: true,
    sensitive_scan: sensitiveScan,
    consented_at: body.consentedAt,
  };

  let { error } = await client.from("ai_consents").upsert(fullPayload, { onConflict: "id" });

  if (error && isMissingColumnError(error.message)) {
    // Remote missing migration 007 — strip new columns and retry.
    const minimal = {
      id: fullPayload.id,
      user_id: fullPayload.user_id,
      project_id: fullPayload.project_id,
      data_categories: fullPayload.data_categories,
      external_services: fullPayload.external_services,
      redaction_confirmed: fullPayload.redaction_confirmed,
      consented_at: fullPayload.consented_at,
    };
    const retry = await client.from("ai_consents").upsert(minimal, { onConflict: "id" });
    error = retry.error;
  }

  if (error) {
    console.error("[ai-consents] Supabase upsert failed", error);
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
  return Response.json(
    {
      ok: true,
      data: {
        id: body.id,
        projectId: body.projectId,
        programId,
        trainingTaskId,
        purpose,
        dataCategories,
        externalServices: body.externalServices,
        redactionConfirmed: true,
        sensitiveScan,
        consentedAt: body.consentedAt,
      },
    },
    { status: 201 }
  );
}

/**
 * Training Program Consents (/api/training/programs/[programId]/consents)
 *
 * Functionality:
 * - GET lists AI-consent audit rows for the program with pagination and optional purpose filtering.
 * - Staff or program TA only; TA responses mask full user UUIDs while still returning short ids.
 * - Joins profiles for display names and returns aggregate redaction/sensitive-scan stats.
 *
 * Notes:
 * - Reads ai_consents and profiles; access via requireStaffOrProgramTA.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffOrProgramTA } from "@/lib/supabase/roles";

/**
 * Camp consent audit — staff or TA can list redaction/AI consent proofs
 * recorded for this program (counts only; no raw form text).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireStaffOrProgramTA(supabase, params.programId);
  if (auth.error) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.error === "FORBIDDEN" ? 403 : 401 }
    );
  }

  // Parse pagination and optional purpose filter from the query string.
  const url = new URL(req.url);
  const purpose = url.searchParams.get("purpose") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20));

  // Build the paginated consent query for this program.
  let query = supabase
    .from("ai_consents")
    .select(
      "id, user_id, project_id, program_id, training_task_id, purpose, data_categories, external_services, redaction_confirmed, sensitive_scan, consented_at",
      { count: "exact" }
    )
    .eq("program_id", params.programId)
    .order("consented_at", { ascending: false });

  if (purpose) query = query.eq("purpose", purpose);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Resolve display names for the user ids on this page.
  const userIds = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
  const profileById = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileById.set(p.id as string, (p.display_name as string | null) ?? null);
    }
  }

  // TA must not see full user uuid in audit list when possible — still show short id.
  const redactIds = auth.role === "ta";
  const rows = (data ?? []).map((row) => {
    const uid = row.user_id as string;
    return {
      id: row.id,
      userId: redactIds && uid.length > 8 ? `${uid.slice(0, 4)}…${uid.slice(-4)}` : uid,
      displayName: profileById.get(uid) ?? null,
      projectId: row.project_id,
      programId: row.program_id,
      trainingTaskId: row.training_task_id,
      purpose: row.purpose,
      dataCategories: row.data_categories ?? [],
      externalServices: row.external_services ?? [],
      redactionConfirmed: row.redaction_confirmed,
      sensitiveScan: row.sensitive_scan ?? { total: 0, byCategory: {} },
      consentedAt: row.consented_at,
    };
  });

  // Aggregate: submits with redaction confirmed vs sensitive hits at consent time.
  // Fetch every consent row for aggregates independent of pagination.
  const { data: allForStats } = await supabase
    .from("ai_consents")
    .select("purpose, redaction_confirmed, sensitive_scan")
    .eq("program_id", params.programId);

  const stats = {
    total: allForStats?.length ?? 0,
    trainingSubmit: 0,
    redactionConfirmed: 0,
    hadSensitiveAtScan: 0,
  };
  for (const row of allForStats ?? []) {
    if (row.purpose === "training_submit") stats.trainingSubmit += 1;
    if (row.redaction_confirmed) stats.redactionConfirmed += 1;
    const scan = row.sensitive_scan as { total?: number } | null;
    if (scan && Number(scan.total) > 0) stats.hadSensitiveAtScan += 1;
  }

  return Response.json({
    ok: true,
    data: rows,
    stats,
    page,
    pageSize,
    total: count ?? rows.length,
    access: auth.role === "ta" ? "ta" : "staff",
  });
}

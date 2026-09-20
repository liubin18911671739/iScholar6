/**
 * Training Program Export (/api/training/programs/[programId]/export)
 *
 * Functionality:
 * - GET exports members, submissions, reviews, or gradebook for the program as JSON or CSV.
 * - Staff/TA only; TA exports are always redacted, staff may pass redact=0 to include PII.
 * - Uses the service-role admin to attach learner emails for the members scope.
 *
 * Notes:
 * - Mapping and CSV helpers live in lib/training/export; scope is validated against members|submissions|reviews|gradebook.
 * - Reads training_programs, training_enrollments, training_submissions, training_reviews, profiles.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffOrProgramTA } from "@/lib/supabase/roles";
import {
  mapGradebookForExport,
  mapMembersForExport,
  mapReviewsForExport,
  mapSubmissionsForExport,
  toCsv,
  type ExportScope,
} from "@/lib/training/export";

/** Build a service-role Supabase client when URL and key are configured; null otherwise. */
function serviceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Export program members, submissions, reviews, or gradebook as JSON or CSV. */
export async function GET(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaffOrProgramTA(supabase, params.programId);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const scope = (url.searchParams.get("scope") ?? "members") as ExportScope;
  // TA must always redact PII (emails / full ids).
  const redact = auth.role === "ta" ? true : url.searchParams.get("redact") !== "0";

  // Validate the requested export scope.
  if (!["members", "submissions", "reviews", "gradebook"].includes(scope)) {
    return Response.json({ ok: false, error: "INVALID_SCOPE" }, { status: 400 });
  }

  // Verify the program exists before exporting.
  const { data: program } = await supabase
    .from("training_programs")
    .select("id, name")
    .eq("id", params.programId)
    .maybeSingle();
  if (!program) return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });

  let rows: Array<Record<string, unknown>> = [];

  // Members export: enrollments joined with display name and optional email.
  if (scope === "members") {
    const { data, error } = await supabase
      .from("training_enrollments")
      .select("id, learner_id, role, status, joined_at, profiles:learner_id(display_name)")
      .eq("program_id", params.programId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });

    const emailById = new Map<string, string>();
    const admin = serviceAdmin();
    if (admin) {
      for (let page = 1; page <= 5; page += 1) {
        const { data: users } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        for (const user of users?.users ?? []) {
          if (user.email) emailById.set(user.id, user.email);
        }
        if ((users?.users.length ?? 0) < 200) break;
      }
    }

    rows = mapMembersForExport(
      (data ?? []).map((row) => ({
        ...row,
        display_name: (row.profiles as { display_name?: string } | null)?.display_name ?? null,
        email: emailById.get(row.learner_id as string) ?? null,
      })),
      redact
    );
  } else if (scope === "submissions") {
    const { data, error } = await supabase
      .from("training_submissions")
      .select("id, program_id, task_id, learner_id, status, answers, reflection, updated_at")
      .eq("program_id", params.programId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
    rows = mapSubmissionsForExport((data ?? []) as Array<Record<string, unknown>>, redact);
  // Gradebook export: per-task latest scores and overall average per learner.
  } else if (scope === "gradebook") {
    const [{ data: enrollments }, { data: submissions }] = await Promise.all([
      supabase
        .from("training_enrollments")
        .select("learner_id, status, profiles:learner_id(display_name)")
        .eq("program_id", params.programId)
        .neq("status", "removed"),
      supabase
        .from("training_submissions")
        .select("id, task_id, learner_id, status")
        .eq("program_id", params.programId),
    ]);
    const subIds = (submissions ?? []).map((s) => s.id as string);
    const { data: reviews } = subIds.length
      ? await supabase
          .from("training_reviews")
          .select("submission_id, score, decision, created_at")
          .in("submission_id", subIds)
      : { data: [] as Array<Record<string, unknown>> };
    const scoreBySub = new Map<string, number | null>();
    for (const r of reviews ?? []) {
      const key = r.submission_id as string;
      const existing = scoreBySub.get(key);
      if (existing === undefined) scoreBySub.set(key, (r.score as number | null) ?? null);
    }
    const taskIds = Array.from(
      new Set((submissions ?? []).map((s) => s.task_id as string))
    );
    rows = mapGradebookForExport(
      (enrollments ?? []).map((e) => {
        const learnerId = e.learner_id as string;
        const taskScores: Record<string, number | null> = {};
        let sum = 0;
        let n = 0;
        for (const taskId of taskIds) {
          const sub = (submissions ?? []).find(
            (s) => s.learner_id === learnerId && s.task_id === taskId
          );
          const score = sub ? scoreBySub.get(sub.id as string) ?? null : null;
          taskScores[taskId] = score;
          if (typeof score === "number") {
            sum += score;
            n += 1;
          }
        }
        return {
          learnerId,
          displayName:
            (e.profiles as { display_name?: string | null } | null)?.display_name ?? null,
          email: null,
          taskScores,
          overall: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
          status: e.status as string,
          completedAt: null,
        };
      }),
      redact
    );
  // Reviews export: fetch reviews attached to this program's submissions.
  } else {
    const { data: submissions } = await supabase
      .from("training_submissions")
      .select("id")
      .eq("program_id", params.programId);
    const ids = (submissions ?? []).map((s) => s.id as string);
    if (ids.length === 0) {
      rows = [];
    } else {
      const { data, error } = await supabase
        .from("training_reviews")
        .select("id, submission_id, reviewer_id, decision, feedback, score, created_at")
        .in("submission_id", ids);
      if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
      rows = mapReviewsForExport((data ?? []) as Array<Record<string, unknown>>, redact);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `training-${program.name.replace(/[^\w\u4e00-\u9fff-]+/g, "_")}-${scope}-${stamp}`;

  // Return a downloadable CSV attachment or a JSON envelope.
  if (format === "csv") {
    const csv = toCsv(rows);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      },
    });
  }

  return Response.json({
    ok: true,
    program: { id: program.id, name: program.name },
    scope,
    redact,
    exportedAt: new Date().toISOString(),
    rows,
  });
}

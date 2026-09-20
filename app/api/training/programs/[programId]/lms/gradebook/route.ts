/**
 * Training Program LMS Gradebook (/api/training/programs/[programId]/lms/gradebook)
 *
 * Functionality:
 * - GET exports an LMS-oriented gradebook as Canvas/Moodle/generic CSV or an AGS-shaped JSON payload.
 * - Staff or program TA only; TA exports never include emails.
 * - Validates format and as/email params and returns 404 when the program is missing.
 *
 * Notes:
 * - buildLmsGradebookRows/toAgsScoreLines and toCsv render output; reads enrollments/submissions/reviews.
 * - Does not perform LTI OAuth; intended for import/manual passback prep.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffOrProgramTA } from "@/lib/supabase/roles";
import {
  buildLmsGradebookRows,
  toAgsScoreLines,
  type GradebookLearner,
  type LmsGradebookFormat,
} from "@/lib/lms/gradebook";
import { toCsv } from "@/lib/training/export";

/** Build a service-role Supabase client for optional email enrichment; null when unconfigured. */
function serviceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * LMS-oriented gradebook export (Canvas/Moodle CSV + AGS-shaped JSON).
 * Does not perform LTI OAuth; for import/manual passback prep.
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

  // Parse and validate the gradebook format/output options.
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "generic") as LmsGradebookFormat;
  if (!["generic", "canvas", "moodle"].includes(format)) {
    return Response.json({ ok: false, error: "INVALID_FORMAT" }, { status: 400 });
  }
  const as = url.searchParams.get("as") === "ags" ? "ags" : "csv";
  // TA always no emails
  const includeEmail = auth.role !== "ta" && url.searchParams.get("email") !== "0";

  // Verify the program exists before building the export.
  const { data: program } = await supabase
    .from("training_programs")
    .select("id, name")
    .eq("id", params.programId)
    .maybeSingle();
  if (!program) {
    return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });
  }

  // Load enrollments and submissions concurrently.
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
        .select("submission_id, score, created_at")
        .in("submission_id", subIds)
    : { data: [] as Array<Record<string, unknown>> };

  // Keep the latest score per submission (reviews sorted newest first).
  const scoreBySub = new Map<string, number | null>();
  for (const r of [...(reviews ?? [])].sort(
    (a, b) =>
      new Date(b.created_at as string).getTime() -
      new Date(a.created_at as string).getTime()
  )) {
    const key = r.submission_id as string;
    if (!scoreBySub.has(key)) scoreBySub.set(key, (r.score as number | null) ?? null);
  }

  const emailById = new Map<string, string>();
  if (includeEmail) {
    const admin = serviceAdmin();
    if (admin) {
      for (let page = 1; page <= 5; page += 1) {
        const { data: users } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        for (const u of users?.users ?? []) {
          if (u.email) emailById.set(u.id, u.email);
        }
        if ((users?.users.length ?? 0) < 200) break;
      }
    }
  }

  const taskIds = Array.from(
    new Set((submissions ?? []).map((s) => s.task_id as string))
  );

  const learners: GradebookLearner[] = (enrollments ?? []).map((e) => {
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
      email: includeEmail ? emailById.get(learnerId) ?? null : null,
      taskScores,
      overall: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
      status: e.status as string,
      completedAt: null,
    };
  });

  // AGS-shaped JSON payload for manual or integration wiring.
  if (as === "ags") {
    return Response.json({
      ok: true,
      program: { id: program.id, name: program.name },
      format: "ags",
      lineItem: {
        id: `urn:ischolar:program:${params.programId}:overall`,
        label: `${program.name} Overall`,
        scoreMaximum: 100,
      },
      scores: toAgsScoreLines(
        learners,
        `urn:ischolar:program:${params.programId}:overall`
      ),
      note: "LTI Advantage AGS-shaped payload for manual/integration wiring. No OAuth in this endpoint.",
    });
  }

  const rows = buildLmsGradebookRows(learners, format, {
    courseName: program.name as string,
  });
  const csv = toCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = String(program.name).replace(/[^\w\u4e00-\u9fff-]+/g, "_");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lms-${format}-${safeName}-${stamp}.csv"`,
    },
  });
}

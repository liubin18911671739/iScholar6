/**
 * Training Program Report (/api/training/programs/[programId]/report)
 *
 * Functionality:
 * - GET builds a per-class report (completion, scores, reviewer activity) for staff or the program's TA.
 * - Loads program, tasks, enrollments, submissions, and reviews, then maps them into buildClassReport.
 * - Requires an authenticated session and returns 404 when the program does not exist.
 *
 * Notes:
 * - buildClassReport from lib/training/reporting; ProgramTaskConfig/ReviewLike/SubmissionLike from lib/training/progress.
 * - Reads training_programs, training_program_tasks, training_enrollments, training_submissions, training_reviews, profiles.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffOrProgramTA } from "@/lib/supabase/roles";
import { buildClassReport } from "@/lib/training/reporting";
import type { ProgramTaskConfig, ReviewLike, SubmissionLike } from "@/lib/training/progress";

/** Build the class report payload for staff or the program TA. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaffOrProgramTA(supabase, params.programId);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  // Load the program header or fail fast with 404.
  const { data: program, error: programError } = await supabase
    .from("training_programs")
    .select("id, name, status")
    .eq("id", params.programId)
    .maybeSingle();
  if (programError) return Response.json({ ok: false, error: programError.message }, { status: 400 });
  if (!program) return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });

  // Fetch curriculum, enrollments, and submissions concurrently.
  const [{ data: taskRows }, { data: enrollments }, { data: submissions }] = await Promise.all([
    supabase
      .from("training_program_tasks")
      .select("*")
      .eq("program_id", params.programId)
      .order("ordinal"),
    supabase
      .from("training_enrollments")
      .select("learner_id, status, profiles:learner_id(display_name)")
      .eq("program_id", params.programId),
    supabase
      .from("training_submissions")
      .select("id, task_id, learner_id, status, updated_at")
      .eq("program_id", params.programId),
  ]);

  const submissionIds = (submissions ?? []).map((s) => s.id as string);
  const { data: reviews } = submissionIds.length
    ? await supabase
        .from("training_reviews")
        .select("id, submission_id, reviewer_id, decision, score, created_at")
        .in("submission_id", submissionIds)
    : { data: [] as Array<Record<string, unknown>> };

  const submissionMeta = new Map(
    (submissions ?? []).map((s) => [
      s.id as string,
      { learner_id: s.learner_id as string, task_id: s.task_id as string },
    ])
  );

  const configs: ProgramTaskConfig[] = (taskRows ?? []).map((row) => ({
    taskId: row.task_id as string,
    ordinal: row.ordinal as number,
    dueAt: (row.due_at as string | null) ?? null,
    required: Boolean(row.required),
    requiresReviewOverride: (row.requires_review_override as boolean | null) ?? null,
  }));

  const submissionLikes: SubmissionLike[] = (submissions ?? []).map((s) => ({
    id: s.id as string,
    task_id: s.task_id as string,
    learner_id: s.learner_id as string,
    status: s.status as string,
    updated_at: s.updated_at as string,
  }));

  const reviewLikes: Array<
    ReviewLike & { learner_id: string; task_id: string; reviewer_id?: string }
  > = (reviews ?? []).flatMap((r) => {
    const meta = submissionMeta.get(r.submission_id as string);
    if (!meta) return [];
    return [
      {
        submission_id: r.submission_id as string,
        learner_id: meta.learner_id,
        task_id: meta.task_id,
        reviewer_id: (r.reviewer_id as string | undefined) ?? undefined,
        decision: r.decision as string,
        score: (r.score as number | null) ?? null,
        created_at: r.created_at as string,
      },
    ];
  });

  // Assemble the report from curriculum configs and mapped submission/review rows.
  const report = buildClassReport({
    curriculumConfigs: configs,
    enrollments: (enrollments ?? []).map((e) => ({
      learner_id: e.learner_id as string,
      status: e.status as string,
      display_name:
        (e.profiles as { display_name?: string | null } | null)?.display_name ?? null,
    })),
    submissions: submissionLikes,
    reviews: reviewLikes,
  });

  return Response.json({
    ok: true,
    data: {
      program: { id: program.id, name: program.name, status: program.status },
      ...report,
    },
  });
}

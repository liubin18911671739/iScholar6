/**
 * Training Program Progress (/api/training/programs/[programId]/progress)
 *
 * Functionality:
 * - GET returns either learner self progress or full class progress for staff and the camp TA.
 * - The optional learnerId query param filters class rows; scope and access fields describe the view.
 * - Plain learners must be enrolled and only ever receive their own progress; staff/TA get class scope.
 *
 * Notes:
 * - Uses resolveProgramCurriculum/buildLearnerProgress/buildClassProgress and the schema-compat enrollment loader.
 * - Reads training_program_tasks, training_submissions, training_reviews, and training_enrollments/profiles.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProgramTA, requireStaff } from "@/lib/supabase/roles";
import {
  isMissingRelationError,
  loadEnrollmentCompat,
} from "@/lib/server/schema-compat";
import {
  buildClassProgress,
  buildLearnerProgress,
  resolveProgramCurriculum,
  type ProgramTaskConfig,
  type ReviewLike,
} from "@/lib/training/progress";

/** Return self or class training progress based on the caller's role. */
export async function GET(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  const staff = await requireStaff(supabase);
  const isStaff = !staff.error;
  // Staff or camp TA → full class progress; plain learner → self only.
  const isTa = !isStaff && (await isProgramTA(supabase, user.id, params.programId));
  const canViewClass = isStaff || isTa;

  if (!canViewClass) {
    const enrollment = await loadEnrollmentCompat(supabase, params.programId, user.id);
    if (!enrollment) {
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
  }

  // Load the camp curriculum, tolerating a missing tasks table.
  const { data: taskRows, error: taskError } = await supabase
    .from("training_program_tasks")
    .select("*")
    .eq("program_id", params.programId)
    .order("ordinal");
  // Missing curriculum table → MVP full set.
  if (taskError && !isMissingRelationError(taskError.message)) {
    return Response.json({ ok: false, error: taskError.message }, { status: 400 });
  }

  const configs: ProgramTaskConfig[] = (taskRows ?? []).map((row) => ({
    taskId: row.task_id as string,
    ordinal: row.ordinal as number,
    dueAt: (row.due_at as string | null) ?? null,
    required: Boolean(row.required),
    requiresReviewOverride: (row.requires_review_override as boolean | null) ?? null,
  }));
  const curriculum = resolveProgramCurriculum(configs);

  // Load submissions, then their reviews, joining review rows back to learner/task.
  const { data: submissions, error: subError } = await supabase
    .from("training_submissions")
    .select("id, task_id, learner_id, status, updated_at")
    .eq("program_id", params.programId);
  if (subError) return Response.json({ ok: false, error: subError.message }, { status: 400 });

  const submissionIds = (submissions ?? []).map((s) => s.id as string);
  const { data: reviews } = submissionIds.length
    ? await supabase
        .from("training_reviews")
        .select("id, submission_id, decision, score, created_at")
        .in("submission_id", submissionIds)
    : { data: [] as Array<Record<string, unknown>> };

  const submissionMeta = new Map(
    (submissions ?? []).map((s) => [
      s.id as string,
      { learner_id: s.learner_id as string, task_id: s.task_id as string },
    ])
  );

  const reviewRows: Array<ReviewLike & { learner_id: string; task_id: string }> = (
    reviews ?? []
  ).flatMap((r) => {
    const meta = submissionMeta.get(r.submission_id as string);
    if (!meta) return [];
    return [
      {
        submission_id: r.submission_id as string,
        learner_id: meta.learner_id,
        task_id: meta.task_id,
        decision: r.decision as string,
        score: (r.score as number | null) ?? null,
        created_at: r.created_at as string,
      },
    ];
  });

  // Learner self view: only own progress (not TA/staff).
  if (!canViewClass) {
    const ownSubs = (submissions ?? []).filter((s) => s.learner_id === user.id);
    const reviewsByTask = new Map<string, ReviewLike>();
    for (const review of reviewRows) {
      if (review.learner_id !== user.id) continue;
      const existing = reviewsByTask.get(review.task_id);
      if (
        !existing ||
        new Date(review.created_at).getTime() > new Date(existing.created_at).getTime()
      ) {
        reviewsByTask.set(review.task_id, review);
      }
    }
    const progress = buildLearnerProgress({
      curriculum,
      submissions: ownSubs.map((s) => ({
        task_id: s.task_id as string,
        learner_id: s.learner_id as string,
        status: s.status as string,
        updated_at: s.updated_at as string,
      })),
      reviewsByTask,
    });
    return Response.json({ ok: true, data: { scope: "self", ...progress } });
  }

  // Build class-wide progress rows for staff/TA viewers.
  const { data: enrollments, error: enrError } = await supabase
    .from("training_enrollments")
    .select("learner_id, status, profiles:learner_id(display_name)")
    .eq("program_id", params.programId);
  if (enrError) return Response.json({ ok: false, error: enrError.message }, { status: 400 });

  const classRows = buildClassProgress({
    curriculum,
    enrollments: (enrollments ?? []).map((e) => ({
      learner_id: e.learner_id as string,
      status: e.status as string,
      display_name:
        (e.profiles as { display_name?: string | null } | null)?.display_name ?? null,
    })),
    submissions: (submissions ?? []).map((s) => ({
      task_id: s.task_id as string,
      learner_id: s.learner_id as string,
      status: s.status as string,
      updated_at: s.updated_at as string,
    })),
    reviews: reviewRows,
  });

  const url = new URL(req.url);
  const learnerId = url.searchParams.get("learnerId");
  const filtered = learnerId
    ? classRows.filter((row) => row.learnerId === learnerId)
    : classRows;

  return Response.json({
    ok: true,
    data: {
      scope: "class",
      access: isStaff ? "staff" : "ta",
      curriculum: curriculum.map((c) => ({
        taskId: c.taskId,
        title: c.definition.title,
        ordinal: c.ordinal,
        dueAt: c.dueAt ?? null,
        required: c.required,
      })),
      members: filtered,
    },
  });
}

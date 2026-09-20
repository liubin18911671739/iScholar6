/**
 * Training Analytics Dashboard API (/api/training/analytics/dashboard)
 *
 * Functionality:
 * - GET returns a semester dashboard plus an optional risk heatmap for training programs.
 * - Staff see programs scoped by role; TAs see only programs they assist, others receive 403.
 * - Accepts `from`, `to`, and `heatmapProgramId` query parameters to bound the reporting window.
 *
 * Notes:
 * - Aggregates `training_programs`, `training_program_tasks`, `training_enrollments`, `training_submissions`, and `training_reviews`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listStaffOrgIds, listTaProgramIds, requireStaff } from "@/lib/supabase/roles";
import { buildClassReport } from "@/lib/training/reporting";
import {
  buildRiskHeatmap,
  buildSemesterDashboard,
  type ProgramSnapshot,
} from "@/lib/training/reporting-v2";
import type { ProgramTaskConfig, ReviewLike, SubmissionLike } from "@/lib/training/progress";
import { loadRemotePacks } from "@/lib/training/remote-packs";
import { buildTaskCatalog } from "@/lib/training/task-catalog";
import { resolveProgramCurriculum } from "@/lib/training/progress";

/** Loads one program's tasks, enrollments, submissions, and reviews into a snapshot. */
async function loadProgramSnapshot(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  program: {
    id: string;
    name: string;
    status?: string;
    cohort_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  },
  packs: Awaited<ReturnType<typeof loadRemotePacks>>
): Promise<ProgramSnapshot> {
  // Fetch tasks, enrollments, and submissions for the program in parallel.
  const catalog = buildTaskCatalog(packs);
  const [{ data: taskRows }, { data: enrollments }, { data: submissions }] = await Promise.all([
    supabase
      .from("training_program_tasks")
      .select("*")
      .eq("program_id", program.id)
      .order("ordinal"),
    supabase
      .from("training_enrollments")
      .select("learner_id, status, profiles:learner_id(display_name)")
      .eq("program_id", program.id),
    supabase
      .from("training_submissions")
      .select("id, task_id, learner_id, status, updated_at")
      .eq("program_id", program.id),
  ]);

  // Load reviews only when there are submissions to join against.
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

  // Ensure curriculum definitions resolve for pack tasks
  resolveProgramCurriculum(configs, { catalog });

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
        decision: r.decision as string,
        score: (r.score as number | null) ?? null,
        created_at: r.created_at as string,
        reviewer_id: r.reviewer_id as string,
      },
    ];
  });

  const report = buildClassReport({
    curriculumConfigs: configs,
    packs,
    enrollments: (enrollments ?? []).map((e) => ({
      learner_id: e.learner_id as string,
      status: e.status as string,
      display_name:
        (e.profiles as { display_name?: string | null } | null)?.display_name ?? null,
    })),
    submissions: submissionLikes,
    reviews: reviewLikes,
  });

  return {
    programId: program.id,
    name: program.name,
    status: program.status,
    cohortName: program.cohort_name,
    startDate: program.start_date,
    endDate: program.end_date,
    report,
  };
}

/** Returns the semester dashboard and heatmap scoped to the caller's staff role. */
export async function GET(req: NextRequest) {
  // Require Supabase configuration and an authenticated user.
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // Resolve staff role; TAs are limited to their assigned programs.
  const staff = await requireStaff(supabase);
  const isStaff = !staff.error;
  let programFilter: string[] | null = null;
  if (!isStaff) {
    const taIds = await listTaProgramIds(supabase, user.id);
    if (taIds.length === 0) {
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    programFilter = taIds;
  }

  // Derive the reporting window from query params, defaulting to year-to-date.
  const url = new URL(req.url);
  const from =
    url.searchParams.get("from") ??
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to =
    url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const heatmapProgramId = url.searchParams.get("heatmapProgramId");

  // Build the program query with role-based scoping applied below.
  let query = supabase
    .from("training_programs")
    .select("id, name, status, cohort_name, start_date, end_date, organization_id")
    .order("updated_at", { ascending: false });
  if (programFilter) {
    query = query.in("id", programFilter);
  } else if (isStaff && staff.role === "librarian") {
    const orgIds = await listStaffOrgIds(supabase, user.id, staff.role);
    if (orgIds !== "all") {
      if (orgIds.length === 0) {
        return Response.json({
          ok: true,
          data: {
            window: { from, to },
            programs: [],
            totals: { programs: 0, members: 0, pendingReviews: 0, avgCompletionRate: 0 },
            reviewerKpis: [],
            heatmap: null,
            access: "staff",
            scope: "org",
          },
        });
      }
      query = query.in("organization_id", orgIds);
    }
  }

  const { data: programs, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Semester window: include camps overlapping [from, to]
  const inWindow = (programs ?? []).filter((p) => {
    const start = p.start_date as string | null;
    const end = p.end_date as string | null;
    if (!start && !end) return true;
    if (start && start > to) return false;
    if (end && end < from) return false;
    return true;
  });

  // Build snapshots for overlapping programs, capped to bound query cost.
  const packs = await loadRemotePacks(supabase);
  const snapshots: ProgramSnapshot[] = [];
  for (const program of inWindow.slice(0, 30)) {
    snapshots.push(await loadProgramSnapshot(supabase, program as never, packs));
  }

  const allReviews: Array<{
    reviewer_id: string;
    decision: string;
    score?: number | null;
  }> = [];
  for (const snap of snapshots) {
    for (const row of snap.report.reviewLoad.byReviewer) {
      // KPI counts come from byReviewer aggregate; detailed decisions need extra query.
      allReviews.push(
        ...Array.from({ length: row.count }, () => ({
          reviewer_id: row.reviewerId,
          decision: "approved",
          score: null,
        }))
      );
    }
  }

  // Prefer real review rows for KPI when feasible
  const programIds = snapshots.map((s) => s.programId);
  if (programIds.length > 0) {
    const { data: subs } = await supabase
      .from("training_submissions")
      .select("id, program_id")
      .in("program_id", programIds);
    const ids = (subs ?? []).map((s) => s.id as string);
    if (ids.length > 0) {
      const { data: revs } = await supabase
        .from("training_reviews")
        .select("reviewer_id, decision, score")
        .in("submission_id", ids.slice(0, 2000));
      if (revs?.length) {
        allReviews.length = 0;
        for (const r of revs) {
          allReviews.push({
            reviewer_id: r.reviewer_id as string,
            decision: r.decision as string,
            score: (r.score as number | null) ?? null,
          });
        }
      }
    }
  }

  // Aggregate snapshots and review decisions into the semester dashboard.
  const dashboard = buildSemesterDashboard({
    from,
    to,
    snapshots,
    reviews: allReviews,
  });

  // Optionally build a per-learner risk heatmap for the requested program.
  let heatmap = null;
  const heatId = heatmapProgramId ?? snapshots[0]?.programId;
  if (heatId) {
    const snap = snapshots.find((s) => s.programId === heatId);
    if (snap) {
      const cells: Array<{
        learnerId: string;
        taskId: string;
        revisionCount: number;
        escalatedCount: number;
        overdue?: boolean;
      }> = [];
      // Approximate from risk list + byTask (full matrix would need per-task reviews)
      for (const risk of snap.report.risk) {
        for (const task of snap.report.byTask) {
          cells.push({
            learnerId: risk.learnerId,
            taskId: task.taskId,
            revisionCount: risk.revisionCount,
            escalatedCount: risk.escalatedCount,
          });
        }
      }
      heatmap = buildRiskHeatmap({
        learners: snap.report.risk.map((r) => ({
          learnerId: r.learnerId,
          displayName: r.displayName,
        })),
        taskIds: snap.report.byTask.map((t) => t.taskId),
        cells,
      });
    }
  }

  return Response.json({
    ok: true,
    data: {
      ...dashboard,
      heatmap,
      access: isStaff ? "staff" : "ta",
    },
  });
}

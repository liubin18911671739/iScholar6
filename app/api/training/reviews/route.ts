/**
 * Training Reviews (/api/training/reviews)
 *
 * Functionality:
 * - GET lists submissions with reviews, evidence cards, learner names, and wait times, filtered and paginated.
 * - POST either claims/unclaims a submission in the queue or records a review decision via the review_training_submission RPC.
 * - Requires reviewer context; TA callers are scoped to their camps and non-pending claims return 409.
 *
 * Notes:
 * - requireReviewerContext/requireReviewerForSubmission gate access; schemas live in training-validation.
 * - Reads training_submissions/training_reviews/evidence_cards/profiles and writes training_submissions/reviews.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  requireReviewerContext,
  requireReviewerForSubmission,
} from "@/lib/server/training-access";
import {
  trainingClaimSchema,
  trainingReviewSchema,
  validationError,
} from "@/lib/server/training-validation";
import { trainingTaskTitle } from "@/lib/training/task-meta";

/** Submission row plus its joined reviews as returned from the list query. */
type SubmissionRow = {
  id: string;
  program_id: string;
  task_id: string;
  learner_id: string;
  answers: Record<string, string>;
  reflection?: string | null;
  status: string;
  updated_at: string;
  claimed_by?: string | null;
  claimed_at?: string | null;
  training_reviews?: Array<{
    id: string;
    decision: string;
    feedback?: string | null;
    score?: number | null;
    created_at: string;
    reviewer_id: string;
  }>;
};

/** Milliseconds a submission has been waiting since it was last updated. */
function waitMs(updatedAt: string): number {
  return Math.max(0, Date.now() - new Date(updatedAt).getTime());
}

/** Decorate a submission row with derived titles, names, evidence, and latest review. */
function enrichSubmission(
  row: SubmissionRow,
  evidenceBySubmission: Map<string, unknown[]>,
  profileById: Map<string, { display_name?: string | null }>
) {
  const reviews = [...(row.training_reviews ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return {
    ...row,
    task_title: trainingTaskTitle(row.task_id),
    learner_display_name: profileById.get(row.learner_id)?.display_name ?? null,
    wait_ms: waitMs(row.updated_at),
    evidence_cards: evidenceBySubmission.get(row.id) ?? [],
    training_reviews: reviews,
    latest_review: reviews[0] ?? null,
  };
}

/** List reviewable submissions with filters and pagination; staff/TA only. */
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireReviewerContext(supabase);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId") ?? undefined;
  const learnerId = url.searchParams.get("learnerId") ?? undefined;
  let programId = url.searchParams.get("programId") ?? undefined;
  const status = url.searchParams.get("status") ?? "submitted";
  const decision = url.searchParams.get("decision") ?? undefined;
  const escalatedOnly = url.searchParams.get("escalatedOnly") === "true";
  const peerStatus = url.searchParams.get("peerStatus") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20));
  const sort = url.searchParams.get("sort") === "oldest" ? "oldest" : "newest";

  // TA may only see submissions in their camps.
  if (!auth.isStaff) {
    if (programId && !auth.taProgramIds.includes(programId)) {
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    if (!programId && auth.taProgramIds.length === 1) {
      programId = auth.taProgramIds[0];
    }
  }

  // Build the submissions query with status/task/learner/program filters.
  let query = supabase
    .from("training_submissions")
    .select("*, training_reviews(*)", { count: "exact" });

  if (status === "pending") {
    query = query.eq("status", "submitted");
  } else if (status === "all") {
    // no status filter
  } else if (status) {
    query = query.eq("status", status);
  }

  if (taskId) query = query.eq("task_id", taskId);
  if (learnerId) query = query.eq("learner_id", learnerId);
  if (programId) query = query.eq("program_id", programId);
  else if (!auth.isStaff) query = query.in("program_id", auth.taProgramIds);
  if (escalatedOnly) query = query.eq("status", "escalated");
  if (peerStatus) query = query.eq("peer_status", peerStatus);

  query = query.order("updated_at", { ascending: sort === "oldest" });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  let rows = (data ?? []) as SubmissionRow[];

  // Optional filter by latest review decision (client-side on page for simplicity).
  if (decision) {
    rows = rows.filter((row) => {
      const reviews = [...(row.training_reviews ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return reviews[0]?.decision === decision;
    });
  }

  const submissionIds = rows.map((r) => r.id);
  const learnerIds = Array.from(new Set(rows.map((r) => r.learner_id)));

  // Attach evidence cards and learner display names for the page rows.
  const evidenceBySubmission = new Map<string, unknown[]>();
  if (submissionIds.length > 0) {
    const { data: evidence } = await supabase
      .from("evidence_cards")
      .select("*")
      .in("submission_id", submissionIds);
    for (const card of evidence ?? []) {
      const key = String((card as { submission_id: string }).submission_id);
      const list = evidenceBySubmission.get(key) ?? [];
      list.push(card);
      evidenceBySubmission.set(key, list);
    }
  }

  const profileById = new Map<string, { display_name?: string | null }>();
  if (learnerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", learnerIds);
    for (const profile of profiles ?? []) {
      profileById.set(profile.id, profile);
    }
  }

  const enriched = rows.map((row) => enrichSubmission(row, evidenceBySubmission, profileById));

  return Response.json({
    ok: true,
    data: enriched,
    page,
    pageSize,
    total: count ?? enriched.length,
    access: auth.isStaff ? "staff" : "ta",
  });
}

/** Claim/unclaim a submission or record a review decision. */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const body = await req.json().catch(() => null);

  // Claim / unclaim a submission in the queue.
  if (body && typeof body === "object" && "claim" in body) {
    const parsed = trainingClaimSchema.safeParse(body);
    if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
    const { submissionId, claim } = parsed.data;
    const auth = await requireReviewerForSubmission(supabase, submissionId);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
    }
    const patch = claim
      ? { claimed_by: auth.user.id, claimed_at: new Date().toISOString() }
      : { claimed_by: null, claimed_at: null };
    const { data, error } = await supabase
      .from("training_submissions")
      .update(patch)
      .eq("id", submissionId)
      .eq("status", "submitted")
      .select()
      .maybeSingle();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return Response.json({ ok: false, error: "SUBMISSION_NOT_PENDING" }, { status: 409 });
    return Response.json({ ok: true, data });
  }

  const parsed = trainingReviewSchema.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
  const { submissionId, decision, feedback, score, rubric } = parsed.data;

  const auth = await requireReviewerForSubmission(supabase, submissionId);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  // Fold rubric entries into the feedback text when present.
  let mergedFeedback = feedback ?? null;
  if (rubric && Object.keys(rubric).length > 0) {
    const rubricLine = Object.entries(rubric)
      .map(([key, value]) => `${key}:${value}`)
      .join(", ");
    mergedFeedback = [feedback?.trim(), `Rubric: ${rubricLine}`].filter(Boolean).join("\n");
  }

  // Record the decision atomically through the DB function.
  const { data, error } = await supabase
    .rpc("review_training_submission", {
      p_submission_id: submissionId,
      p_decision: decision,
      p_feedback: mergedFeedback,
      p_score: score ?? null,
    })
    .single();
  if (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: error.message.includes("SUBMISSION_NOT_PENDING") ? 409 : 400 }
    );
  }
  return Response.json({ ok: true, data }, { status: 201 });
}

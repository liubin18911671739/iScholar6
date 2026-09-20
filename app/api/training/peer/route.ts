/**
 * Peer Review API (/api/training/peer)
 *
 * Functionality:
 * - GET lists the authenticated learner's pending peer review assignments with anonymized author tokens.
 * - POST submits a peer review for an assignment via the `complete_peer_review` RPC.
 * - Both handlers require an authenticated Supabase user and degrade gracefully when peer tables are absent.
 *
 * Notes:
 * - Reads `training_peer_assignments`, `training_submissions`, and `evidence_cards`; `trainingTaskTitle` resolves titles.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  trainingPeerReviewSchema,
  validationError,
} from "@/lib/server/training-validation";
import { isMissingRelationError } from "@/lib/server/schema-compat";
import { anonymizeLearnerToken } from "@/lib/training/peer-review";
import { trainingTaskTitle } from "@/lib/training/task-meta";
import { loadRemotePacks } from "@/lib/training/remote-packs";
import { buildTaskCatalog } from "@/lib/training/task-catalog";

/** Learner: list pending peer review assignments (anonymous author). */
export async function GET() {
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

  // Load this learner's pending peer assignments.
  const { data: assignments, error } = await supabase
    .from("training_peer_assignments")
    .select("id, submission_id, program_id, status, assigned_at, due_at")
    .eq("reviewer_learner_id", user.id)
    .eq("status", "pending")
    .order("assigned_at", { ascending: true });
  if (error) {
    // Migration 180009 not applied yet — peer review unavailable, not a hard failure.
    if (isMissingRelationError(error.message)) {
      return Response.json({
        ok: true,
        data: [],
        feature: "peer_review",
        available: false,
      });
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Resolve the task catalog so items carry readable titles.
  const packs = await loadRemotePacks(supabase);
  const catalog = buildTaskCatalog(packs);
  const items = [];

  // Hydrate each assignment with its submission, evidence, and anonymized author.
  for (const a of assignments ?? []) {
    const { data: sub } = await supabase
      .from("training_submissions")
      .select("id, task_id, learner_id, answers, reflection, program_id")
      .eq("id", a.submission_id)
      .maybeSingle();
    if (!sub) continue;

    // Peer may read camp submissions via TA policy only if TA; learners need select on assigned submission.
    // Fallback: if RLS blocks, assignment still listed without answers.
    const { data: evidence } = await supabase
      .from("evidence_cards")
      .select("id, claim, source_excerpt, verification_status")
      .eq("submission_id", sub.id);

    items.push({
      assignmentId: a.id,
      submissionId: sub.id,
      programId: a.program_id,
      taskId: sub.task_id,
      taskTitle: trainingTaskTitle(sub.task_id as string, catalog),
      authorToken: anonymizeLearnerToken(sub.learner_id as string),
      answers: (sub.answers as Record<string, string>) ?? {},
      reflection: sub.reflection ?? null,
      evidenceCards: (evidence ?? []).map((e) => ({
        id: e.id as string,
        claim: e.claim as string | undefined,
        sourceExcerpt: e.source_excerpt as string | undefined,
        verificationStatus: e.verification_status as string | undefined,
      })),
      assignedAt: a.assigned_at,
      dueAt: a.due_at,
      status: a.status,
    });
  }

  return Response.json({ ok: true, data: items });
}

/** Learner: submit a peer review for an assignment. */
export async function POST(req: NextRequest) {
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

  // Validate the peer review payload before calling the RPC.
  const body = await req.json().catch(() => null);
  const parsed = trainingPeerReviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(validationError(parsed.error), { status: 400 });
  }
  const { assignmentId, decision, feedback, score, evidenceCardIds } = parsed.data;

  // Complete the review atomically through the database RPC.
  const { data, error } = await supabase
    .rpc("complete_peer_review", {
      p_assignment_id: assignmentId,
      p_decision: decision,
      p_feedback: feedback ?? null,
      p_score: score ?? null,
      p_evidence_card_ids: evidenceCardIds ?? [],
    })
    .single();

  if (error) {
    // Map known RPC failures to appropriate HTTP status codes.
    const msg = error.message ?? "";
    if (isMissingRelationError(msg) || /function .* does not exist/i.test(msg)) {
      return Response.json(
        { ok: false, error: "PEER_REVIEW_UNAVAILABLE", hint: "Apply migration 202607180009" },
        { status: 503 }
      );
    }
    const status = msg.includes("FORBIDDEN")
      ? 403
      : msg.includes("NOT_PENDING")
        ? 409
        : msg.includes("NOT_FOUND")
          ? 404
          : 400;
    return Response.json({ ok: false, error: msg }, { status });
  }
  return Response.json({ ok: true, data }, { status: 201 });
}

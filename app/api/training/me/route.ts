/**
 * Learner Training Data API (/api/training/me)
 *
 * Functionality:
 * - GET returns the learner's active enrollments, and with `include=submissions|all` their submissions, reviews, and evidence cards.
 * - POST validates and upserts a learner submission, gating on enrollment, program state, sensitive content, and consent.
 * - Requires an authenticated Supabase user; all rows are scoped to that learner.
 *
 * Notes:
 * - POST assigns an anonymous peer reviewer when the task definition enables peer review and tolerates missing peer tables.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { trainingSubmissionSchema, validationError } from "@/lib/server/training-validation";
import { assertProgramAcceptsSubmissions } from "@/lib/server/training-program-guards";
import { containsSensitiveContent, joinTextFields } from "@/lib/privacy/sensitive-content";
import { pickPeerReviewer } from "@/lib/training/peer-review";
import { loadRemotePacks } from "@/lib/training/remote-packs";
import { buildTaskCatalog, getCatalogTask } from "@/lib/training/task-catalog";

/** Returns the learner's enrollments, optionally with submissions and reviews. */
export async function GET(req: NextRequest) {
  // Require Supabase configuration and an authenticated user.
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  // Honor the include flag to decide how much related data to return.
  const url = new URL(req.url);
  const include = url.searchParams.get("include") ?? "enrollments";

  // Load the learner's non-removed enrollments with their programs.
  const { data: enrollments, error } = await supabase
    .from("training_enrollments")
    .select("*, training_programs(*)")
    .eq("learner_id", user.id)
    .neq("status", "removed");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  if (include !== "submissions" && include !== "all") {
    return Response.json({ ok: true, data: enrollments });
  }

  // Submissions + reviews for the learner (feedback timeline).
  const { data: submissions, error: subError } = await supabase
    .from("training_submissions")
    .select("*, training_reviews(*)")
    .eq("learner_id", user.id)
    .order("updated_at", { ascending: false });
  if (subError) return Response.json({ ok: false, error: subError.message }, { status: 500 });

  // Attach evidence cards grouped by submission.
  const submissionIds = (submissions ?? []).map((s) => s.id as string);
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

  // Sort reviews newest-first and attach the latest review plus evidence.
  const enrichedSubmissions = (submissions ?? []).map((row) => {
    const reviews = [...((row.training_reviews as Array<{ created_at: string }>) ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return {
      ...row,
      training_reviews: reviews,
      latest_review: reviews[0] ?? null,
      evidence_cards: evidenceBySubmission.get(row.id as string) ?? [],
    };
  });

  return Response.json({
    ok: true,
    data: enrollments,
    submissions: enrichedSubmissions,
  });
}

/** Creates or updates a learner submission with consent and peer-review handling. */
export async function POST(req: NextRequest) {
  // Require Supabase configuration and an authenticated user.
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  // Validate the submission payload against the shared schema.
  const body = await req.json().catch(() => null);
  const parsed = trainingSubmissionSchema.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
  const { programId, taskId, answers, reflection, status, consentProof } = parsed.data;

  // Enrollment first — proves program access even when program-row SELECT is RLS-limited
  // or remote schema lacks lifecycle columns.
  // status != removed when column/value exists; ignore filter errors via client-side check.
  let { data: enrollment } = await supabase
    .from("training_enrollments")
    .select("id, status")
    .eq("program_id", programId)
    .eq("learner_id", user.id)
    .maybeSingle();
  if (enrollment && (enrollment as { status?: string }).status === "removed") {
    enrollment = null;
  }
  if (!enrollment) {
    return Response.json({ ok: false, error: "NOT_ENROLLED" }, { status: 403 });
  }

  // Ensure the program still accepts submissions before writing.
  const gate = await assertProgramAcceptsSubmissions(supabase, programId);
  if (!gate.ok) {
    // If program row is unreadable but enrollment exists, allow write except hard archive.
    if (gate.error === "PROGRAM_NOT_FOUND") {
      // continue
    } else {
      return Response.json(
        { ok: false, error: gate.error },
        { status: gate.error === "PROGRAM_NOT_FOUND" ? 404 : 400 }
      );
    }
  }

  // Server-side sensitive gate (defense in depth; client also blocks + one-click mask).
  const blob = joinTextFields({ ...answers, reflection: reflection ?? "" });
  if (containsSensitiveContent(blob)) {
    return Response.json({ ok: false, error: "SENSITIVE_CONTENT" }, { status: 400 });
  }

  // Submitted work requires a camp redaction consent proof for audit.
  if (status === "submitted") {
    if (!consentProof) {
      return Response.json({ ok: false, error: "CONSENT_REQUIRED" }, { status: 403 });
    }
    const consentedAt = Date.parse(consentProof.consentedAt);
    const ageMs = Date.now() - consentedAt;
    if (!Number.isFinite(consentedAt) || ageMs < 0 || ageMs > 30 * 60 * 1000) {
      return Response.json({ ok: false, error: "CONSENT_EXPIRED" }, { status: 403 });
    }
    const { data: consentRow, error: consentError } = await supabase
      .from("ai_consents")
      .select("id, program_id, purpose, redaction_confirmed, user_id")
      .eq("id", consentProof.consentId)
      .eq("user_id", user.id)
      .eq("redaction_confirmed", true)
      .maybeSingle();
    if (
      consentError ||
      !consentRow ||
      consentRow.program_id !== programId ||
      consentRow.purpose !== "training_submit"
    ) {
      return Response.json({ ok: false, error: "CONSENT_INVALID" }, { status: 403 });
    }
  }

  // Detect peer_review flag from catalog (pack tasks may set peerReview).
  let peerStatus: string | null = null;
  if (status === "submitted") {
    const packs = await loadRemotePacks(supabase);
    const catalog = buildTaskCatalog(packs);
    const def = getCatalogTask(taskId, catalog);
    let wantsPeer = Boolean(def?.peerReview);
    const { data: remoteDef } = await supabase
      .from("training_task_definitions")
      .select("peer_review")
      .eq("id", taskId)
      .maybeSingle();
    if (remoteDef?.peer_review === true) wantsPeer = true;
    // Camp-level: program_tasks can force peer via requires_review_override is NOT used for peer;
    // only explicit peer_review on definition. Default off for builtin MVP tasks.
    peerStatus = wantsPeer ? "awaiting_peer" : "none";
  }

  // Upsert the submission keyed by program, task, and learner.
  const baseSubmission = {
    program_id: programId,
    task_id: taskId,
    learner_id: user.id,
    answers,
    reflection: reflection ?? null,
    status,
  };
  let { data, error } = await supabase
    .from("training_submissions")
    .upsert(
      {
        ...baseSubmission,
        ...(peerStatus != null ? { peer_status: peerStatus } : {}),
      },
      { onConflict: "program_id,task_id,learner_id" }
    )
    .select()
    .single();
  // Retry without peer_status when column missing (migration 180009).
  if (error && /peer_status|column|schema cache/i.test(error.message)) {
    peerStatus = null;
    ({ data, error } = await supabase
      .from("training_submissions")
      .upsert(baseSubmission, { onConflict: "program_id,task_id,learner_id" })
      .select()
      .single());
  }
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });

  // Assign one anonymous peer when needed (skip if peer tables not deployed).
  let peerAssignmentId: string | null = null;
  if (status === "submitted" && peerStatus === "awaiting_peer" && data?.id) {
    const { data: members, error: membersError } = await supabase
      .from("training_enrollments")
      .select("learner_id, status")
      .eq("program_id", programId);
    if (!membersError) {
      const reviewerId = pickPeerReviewer({
        submissionId: data.id as string,
        authorLearnerId: user.id,
        candidates: (members ?? [])
          .filter((m) => (m.status as string) !== "removed")
          .map((m) => ({
            learnerId: m.learner_id as string,
            status: (m.status as string) || "active",
          })),
      });
      if (reviewerId) {
        const { data: assignment, error: assignError } = await supabase
          .from("training_peer_assignments")
          .upsert(
            {
              submission_id: data.id,
              program_id: programId,
              reviewer_learner_id: reviewerId,
              status: "pending",
              assigned_at: new Date().toISOString(),
            },
            { onConflict: "submission_id" }
          )
          .select("id")
          .maybeSingle();
        if (!assignError) peerAssignmentId = (assignment?.id as string) ?? null;
        else peerStatus = null; // table missing — ignore peer path
      } else {
        await supabase
          .from("training_submissions")
          .update({ peer_status: "peer_skipped" })
          .eq("id", data.id);
        peerStatus = "peer_skipped";
      }
    }
  }

  return Response.json(
    {
      ok: true,
      data: { ...data, peer_status: peerStatus ?? data.peer_status },
      consentId: status === "submitted" ? consentProof?.consentId ?? null : null,
      peerAssignmentId,
    },
    { status: 201 }
  );
}

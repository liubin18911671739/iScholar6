/**
 * Learner Certificate API (/api/training/me/certificate)
 *
 * Functionality:
 * - POST self-issues a completion certificate for the authenticated learner when they are eligible.
 * - Validates the enrollment, program existence, and completion of all required tasks before issuing.
 * - Returns the existing certificate unchanged when one has already been issued.
 *
 * Notes:
 * - Hashes the payload via `hashCertificatePayload` and stores it in `training_certificates` under a nanoid id.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assessCompletion,
  buildCertificatePayload,
  hashCertificatePayload,
} from "@/lib/training/certificate";
import { loadRemotePacks } from "@/lib/training/remote-packs";
import { buildTaskCatalog } from "@/lib/training/task-catalog";
import {
  deriveTaskStatus,
  resolveProgramCurriculum,
  type ProgramTaskConfig,
} from "@/lib/training/progress";

/** Learner self-issue certificate for a program when eligible. */
export async function POST(req: Request) {
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

  // Require the target program id from the request body.
  const body = await req.json().catch(() => null);
  const programId = body?.programId as string | undefined;
  if (!programId) {
    return Response.json({ ok: false, error: "PROGRAM_ID_REQUIRED" }, { status: 400 });
  }

  // Confirm the learner is actively enrolled in the program.
  const { data: enrollment } = await supabase
    .from("training_enrollments")
    .select("id, status, profiles:learner_id(display_name)")
    .eq("program_id", programId)
    .eq("learner_id", user.id)
    .neq("status", "removed")
    .maybeSingle();
  if (!enrollment) {
    return Response.json({ ok: false, error: "NOT_ENROLLED" }, { status: 403 });
  }

  // Ensure the program exists before building the certificate.
  const { data: program } = await supabase
    .from("training_programs")
    .select("id, name")
    .eq("id", programId)
    .maybeSingle();
  if (!program) {
    return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });
  }

  // Existing cert?
  const { data: existing } = await supabase
    .from("training_certificates")
    .select("*")
    .eq("program_id", programId)
    .eq("learner_id", user.id)
    .maybeSingle();
  if (existing) {
    return Response.json({ ok: true, data: existing, alreadyIssued: true });
  }

  // Resolve the program curriculum to determine which tasks are required.
  const packs = await loadRemotePacks(supabase);
  const catalog = buildTaskCatalog(packs);
  const { data: taskRows } = await supabase
    .from("training_program_tasks")
    .select("*")
    .eq("program_id", programId)
    .order("ordinal");
  const configs: ProgramTaskConfig[] = (taskRows ?? []).map((row) => ({
    taskId: row.task_id as string,
    ordinal: row.ordinal as number,
    dueAt: (row.due_at as string | null) ?? null,
    required: Boolean(row.required),
    requiresReviewOverride: (row.requires_review_override as boolean | null) ?? null,
  }));
  const curriculum = resolveProgramCurriculum(configs, { catalog });
  const requiredTaskIds = curriculum.filter((c) => c.required).map((c) => c.taskId);

  const { data: submissions } = await supabase
    .from("training_submissions")
    .select("id, task_id, learner_id, status, updated_at")
    .eq("program_id", programId)
    .eq("learner_id", user.id);

  // Gather this learner's submissions and their latest reviews.
  const submissionIds = (submissions ?? []).map((s) => s.id as string);
  const { data: reviews } = submissionIds.length
    ? await supabase
        .from("training_reviews")
        .select("submission_id, decision, created_at")
        .in("submission_id", submissionIds)
    : { data: [] as Array<Record<string, unknown>> };

  // Derive each required task's status from its latest review.
  const taskStatus: Record<string, string> = {};
  for (const taskId of requiredTaskIds) {
    const sub = (submissions ?? []).find((s) => s.task_id === taskId);
    if (!sub) {
      taskStatus[taskId] = "not_started";
      continue;
    }
    const revs = (reviews ?? [])
      .filter((r) => r.submission_id === sub.id)
      .sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );
    taskStatus[taskId] = deriveTaskStatus(
      {
        task_id: taskId,
        learner_id: user.id,
        status: sub.status as string,
        updated_at: sub.updated_at as string,
      },
      revs[0]
        ? { decision: revs[0].decision as string, created_at: revs[0].created_at as string }
        : undefined
    );
  }

  // Reject issuance when any required task is incomplete.
  const eligibility = assessCompletion({ requiredTaskIds, taskStatus });
  if (!eligibility.eligible) {
    return Response.json(
      {
        ok: false,
        error: "NOT_ELIGIBLE",
        missingRequired: eligibility.missingRequired,
      },
      { status: 400 }
    );
  }

  // Build, hash, and persist the issued certificate.
  const payload = buildCertificatePayload({
    programId,
    programName: program.name as string,
    learnerId: user.id,
    displayName:
      (enrollment.profiles as { display_name?: string | null } | null)?.display_name ?? null,
    completedTaskIds: eligibility.completedRequired,
    requiredTaskIds,
  });
  const contentHash = await hashCertificatePayload(payload);
  const id = nanoid();
  const { data, error } = await supabase
    .from("training_certificates")
    .insert({
      id,
      program_id: programId,
      learner_id: user.id,
      content_hash: contentHash,
      payload,
      issued_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
  return Response.json({ ok: true, data }, { status: 201 });
}

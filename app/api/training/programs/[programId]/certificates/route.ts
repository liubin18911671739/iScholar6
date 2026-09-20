/**
 * Training Program Certificates (/api/training/programs/[programId]/certificates)
 *
 * Functionality:
 * - GET lists issued certificates (id, learner, content hash, payload, issued_at) for staff or the program TA.
 * - POST batch-issues certificates for eligible active learners, hashing the payload and upserting by (program, learner).
 * - Ineligible learners are skipped with a reason derived from required-task completion and reviews.
 *
 * Notes:
 * - Uses assessCompletion/buildCertificatePayload/hashCertificatePayload, nanoid, remote packs/catalog, and progress helpers.
 * - Reads training_programs/tasks/submissions/reviews/enrollments/profiles; writes training_certificates.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffOrProgramTA } from "@/lib/supabase/roles";
import {
  assessCompletion,
  buildCertificatePayload,
  hashCertificatePayload,
} from "@/lib/training/certificate";
import { loadRemotePacks } from "@/lib/training/remote-packs";
import { buildTaskCatalog } from "@/lib/training/task-catalog";
import { resolveProgramCurriculum, type ProgramTaskConfig } from "@/lib/training/progress";
import { deriveTaskStatus } from "@/lib/training/progress";

/** List certificates already issued for the program; staff or program TA. */
export async function GET(
  _req: NextRequest,
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

  const { data, error } = await supabase
    .from("training_certificates")
    .select("id, learner_id, content_hash, payload, issued_at")
    .eq("program_id", params.programId)
    .order("issued_at", { ascending: false });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, data: data ?? [] });
}

/** Staff/TA: issue certificates for eligible active learners (batch). */
export async function POST(
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

  const body = await req.json().catch(() => ({}));
  const learnerIds: string[] | null = Array.isArray(body?.learnerIds)
    ? body.learnerIds.filter((id: unknown) => typeof id === "string")
    : null;

  // Load the program header before issuing certificates.
  const { data: program } = await supabase
    .from("training_programs")
    .select("id, name, status")
    .eq("id", params.programId)
    .maybeSingle();
  if (!program) {
    return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });
  }

  // Resolve required tasks from remote packs and the stored curriculum.
  const packs = await loadRemotePacks(supabase);
  const catalog = buildTaskCatalog(packs);
  const { data: taskRows } = await supabase
    .from("training_program_tasks")
    .select("*")
    .eq("program_id", params.programId)
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

  // Candidate enrollments, optionally limited to the requested learner ids.
  let enrollQ = supabase
    .from("training_enrollments")
    .select("learner_id, status, profiles:learner_id(display_name)")
    .eq("program_id", params.programId)
    .neq("status", "removed");
  if (learnerIds?.length) enrollQ = enrollQ.in("learner_id", learnerIds);
  const { data: enrollments } = await enrollQ;

  // Collect submissions and their reviews to derive per-task status.
  const { data: submissions } = await supabase
    .from("training_submissions")
    .select("id, task_id, learner_id, status, updated_at")
    .eq("program_id", params.programId);

  const submissionIds = (submissions ?? []).map((s) => s.id as string);
  const { data: reviews } = submissionIds.length
    ? await supabase
        .from("training_reviews")
        .select("submission_id, decision, created_at")
        .in("submission_id", submissionIds)
    : { data: [] as Array<Record<string, unknown>> };

  const reviewsBySubmission = new Map<string, Array<{ decision: string; created_at: string }>>();
  for (const r of reviews ?? []) {
    const key = r.submission_id as string;
    const list = reviewsBySubmission.get(key) ?? [];
    list.push({ decision: r.decision as string, created_at: r.created_at as string });
    reviewsBySubmission.set(key, list);
  }

  const issued: Array<{ learnerId: string; contentHash: string; id: string }> = [];
  const skipped: Array<{ learnerId: string; reason: string }> = [];

  // Derive each required task's status and issue a certificate for eligible learners.
  for (const enr of enrollments ?? []) {
    const learnerId = enr.learner_id as string;
    const taskStatus: Record<string, string> = {};
    for (const taskId of requiredTaskIds) {
      const sub = (submissions ?? []).find(
        (s) => s.learner_id === learnerId && s.task_id === taskId
      );
      if (!sub) {
        taskStatus[taskId] = "not_started";
        continue;
      }
      const revs = reviewsBySubmission.get(sub.id as string) ?? [];
      const latest = [...revs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      taskStatus[taskId] = deriveTaskStatus(
        {
          task_id: taskId,
          learner_id: learnerId,
          status: sub.status as string,
          updated_at: sub.updated_at as string,
        },
        latest
      );
    }

    const eligibility = assessCompletion({ requiredTaskIds, taskStatus });
    if (!eligibility.eligible) {
      skipped.push({
        learnerId,
        reason: `missing:${eligibility.missingRequired.join(",")}`,
      });
      continue;
    }

    // Build a deterministic certificate payload and its content hash.
    const payload = buildCertificatePayload({
      programId: params.programId,
      programName: program.name as string,
      learnerId,
      displayName:
        (enr.profiles as { display_name?: string | null } | null)?.display_name ?? null,
      completedTaskIds: eligibility.completedRequired,
      requiredTaskIds,
    });
    const contentHash = await hashCertificatePayload(payload);
    const id = nanoid();
    const { error } = await supabase.from("training_certificates").upsert(
      {
        id,
        program_id: params.programId,
        learner_id: learnerId,
        content_hash: contentHash,
        payload,
        issued_at: new Date().toISOString(),
      },
      { onConflict: "program_id,learner_id" }
    );
    if (error) {
      skipped.push({ learnerId, reason: error.message });
      continue;
    }
    issued.push({ learnerId, contentHash, id });
  }

  return Response.json({ ok: true, data: { issued, skipped } }, { status: 201 });
}

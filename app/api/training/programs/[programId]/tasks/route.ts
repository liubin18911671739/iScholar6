/**
 * Training Program Tasks (/api/training/programs/[programId]/tasks)
 *
 * Functionality:
 * - GET returns the camp curriculum (configured rows plus the resolved catalog) to staff, the camp TA, or an enrolled learner.
 * - PUT atomically replaces the curriculum (delete then insert) for global staff only, validating task ids against the catalog.
 * - Falls back to the full MVP curriculum when the training_program_tasks relation is missing (migration 180005).
 *
 * Notes:
 * - Uses loadRemotePacks/buildTaskCatalog/resolveProgramCurriculum and schema-compat helpers.
 * - Reads/writes training_program_tasks and reads training_programs.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/roles";
import {
  trainingProgramTasksPutSchema,
  validationError,
} from "@/lib/server/training-validation";
import {
  isMissingRelationError,
  loadEnrollmentCompat,
} from "@/lib/server/schema-compat";
import { resolveProgramCurriculum } from "@/lib/training/progress";
import { buildTaskCatalog, catalogHasTask } from "@/lib/training/task-catalog";
import { loadRemotePacks } from "@/lib/training/remote-packs";

/** Read the camp curriculum for staff, TA, or an enrolled learner. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  // Staff, TA, or enrolled learner may read.
  const staff = await requireStaff(supabase);
  if (staff.error) {
    const enrollment = await loadEnrollmentCompat(supabase, params.programId, user.id);
    if (!enrollment) {
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
  }

  const packs = await loadRemotePacks(supabase);
  const catalog = buildTaskCatalog(packs);

  const { data, error } = await supabase
    .from("training_program_tasks")
    .select("*")
    .eq("program_id", params.programId)
    .order("ordinal");

  // Migration 180005 missing → fall back to full MVP curriculum (not configured).
  if (error && isMissingRelationError(error.message)) {
    const curriculum = resolveProgramCurriculum([], { catalog });
    return Response.json({
      ok: true,
      data: {
        configured: false,
        rows: [],
        catalogSize: catalog.size,
        available: false,
        curriculum: curriculum.map((c) => ({
          taskId: c.taskId,
          ordinal: c.ordinal,
          dueAt: c.dueAt ?? null,
          required: c.required,
          requiresReviewOverride: c.requiresReviewOverride ?? null,
          title: c.definition.title,
          description: c.definition.description,
          agent: c.definition.agent,
          dimension: c.definition.dimension,
          steps: c.definition.steps,
          requiresReview: c.requiresReviewOverride ?? c.definition.requiresReview,
        })),
      },
    });
  }
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });

  const configs = (data ?? []).map((row) => ({
    taskId: row.task_id as string,
    ordinal: row.ordinal as number,
    dueAt: (row.due_at as string | null) ?? null,
    required: Boolean(row.required),
    requiresReviewOverride: (row.requires_review_override as boolean | null) ?? null,
  }));
  const curriculum = resolveProgramCurriculum(configs, { catalog });
  return Response.json({
    ok: true,
    data: {
      configured: (data ?? []).length > 0,
      rows: data ?? [],
      catalogSize: catalog.size,
      available: true,
      curriculum: curriculum.map((c) => ({
        taskId: c.taskId,
        ordinal: c.ordinal,
        dueAt: c.dueAt ?? null,
        required: c.required,
        requiresReviewOverride: c.requiresReviewOverride ?? null,
        title: c.definition.title,
        description: c.definition.description,
        agent: c.definition.agent,
        dimension: c.definition.dimension,
        steps: c.definition.steps,
        requiresReview: c.requiresReviewOverride ?? c.definition.requiresReview,
      })),
    },
  });
}

/** Curriculum write — global staff only (TA cannot edit). */
export async function PUT(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaff(supabase);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = trainingProgramTasksPutSchema.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  const packs = await loadRemotePacks(supabase);
  const catalog = buildTaskCatalog(packs);

  // Reject any task ids not present in the resolved catalog.
  for (const task of parsed.data.tasks) {
    if (!catalogHasTask(task.taskId, catalog)) {
      return Response.json(
        { ok: false, error: "UNKNOWN_TASK", taskId: task.taskId },
        { status: 400 }
      );
    }
  }

  const { data: program } = await supabase
    .from("training_programs")
    .select("id, status")
    .eq("id", params.programId)
    .maybeSingle();
  if (!program) return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });

  // Replace curriculum atomically: delete then insert.
  const { error: delError } = await supabase
    .from("training_program_tasks")
    .delete()
    .eq("program_id", params.programId);
  if (delError) return Response.json({ ok: false, error: delError.message }, { status: 400 });

  if (parsed.data.tasks.length === 0) {
    return Response.json({ ok: true, data: [], fallback: true });
  }

  const now = new Date().toISOString();
  const rows = parsed.data.tasks.map((task, index) => ({
    program_id: params.programId,
    task_id: task.taskId,
    ordinal: task.ordinal ?? index,
    due_at: task.dueAt ?? null,
    required: task.required ?? true,
    requires_review_override: task.requiresReviewOverride ?? null,
    updated_at: now,
    created_at: now,
  }));

  const { data, error } = await supabase
    .from("training_program_tasks")
    .insert(rows)
    .select()
    .order("ordinal");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data });
}

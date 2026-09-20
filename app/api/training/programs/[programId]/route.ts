/**
 * Training Program (/api/training/programs/[programId])
 *
 * Functionality:
 * - PATCH updates program metadata/status and is restricted to global staff (TAs blocked).
 * - GET returns a single program with its enrollments and learner profiles for staff or the program's TA.
 * - Both handlers require an authenticated Supabase session and return { ok, data } or { ok:false, error } envelopes.
 *
 * Notes:
 * - Validation via trainingProgramPatchSchema/programRowFromInput; access via requireStaff/requireStaffOrProgramTA.
 * - Reads/writes training_programs and reads training_enrollments/profiles.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff, requireStaffOrProgramTA } from "@/lib/supabase/roles";
import {
  programRowFromInput,
  trainingProgramPatchSchema,
  validationError,
} from "@/lib/server/training-validation";

/** Update camp metadata/status — global staff only (not TA). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaff(supabase);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  // Validate the partial update payload.
  const body = await req.json().catch(() => null);
  const parsed = trainingProgramPatchSchema.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  // Ensure the program exists before applying the update.
  const { data: existing, error: loadError } = await supabase
    .from("training_programs")
    .select("id, status")
    .eq("id", params.programId)
    .maybeSingle();
  if (loadError) return Response.json({ ok: false, error: loadError.message }, { status: 400 });
  if (!existing) return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });

  // Archived programs: only allow un-archive (status change) or no structural invites — metadata still patchable.
  const row = programRowFromInput(parsed.data, {
    updated_at: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from("training_programs")
    .update(row)
    .eq("id", params.programId)
    .select()
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data });
}

/** Read single camp — staff or camp TA. */
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

  const { data, error } = await supabase
    .from("training_programs")
    .select("*, training_enrollments(*, profiles:learner_id(id, display_name, role))")
    .eq("id", params.programId)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return Response.json({ ok: false, error: "PROGRAM_NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, data, access: auth.role === "ta" ? "ta" : "staff" });
}

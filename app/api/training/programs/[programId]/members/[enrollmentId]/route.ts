/**
 * Training Program Member (/api/training/programs/[programId]/members/[enrollmentId])
 *
 * Functionality:
 * - PATCH updates a single enrollment's status/role and is restricted to staff.
 * - DELETE soft-removes the enrollment (status=removed) so submission/review history is preserved.
 * - Both handlers verify the enrollment belongs to the program and require an authenticated session.
 *
 * Notes:
 * - Validation via trainingMemberPatchSchema; access via requireStaff.
 * - Reads/writes training_enrollments and reads profiles.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/roles";
import {
  trainingMemberPatchSchema,
  validationError,
} from "@/lib/server/training-validation";

/** Update an enrollment's status and/or role; staff-only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { programId: string; enrollmentId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaff(supabase);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  // Validate the status/role patch payload.
  const body = await req.json().catch(() => null);
  const parsed = trainingMemberPatchSchema.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  // Confirm the enrollment belongs to this program before updating.
  const { data: existing, error: loadError } = await supabase
    .from("training_enrollments")
    .select("id, program_id")
    .eq("id", params.enrollmentId)
    .eq("program_id", params.programId)
    .maybeSingle();
  if (loadError) return Response.json({ ok: false, error: loadError.message }, { status: 400 });
  if (!existing) return Response.json({ ok: false, error: "ENROLLMENT_NOT_FOUND" }, { status: 404 });

  const { data, error } = await supabase
    .from("training_enrollments")
    .update({
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
    })
    .eq("id", params.enrollmentId)
    .select("*, profiles:learner_id(id, display_name, role)")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data });
}

/** Soft-remove: status=removed (keeps submission/review history). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { programId: string; enrollmentId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaff(supabase);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  // Confirm the enrollment exists in this program before soft-removing it.
  const { data: existing, error: loadError } = await supabase
    .from("training_enrollments")
    .select("id")
    .eq("id", params.enrollmentId)
    .eq("program_id", params.programId)
    .maybeSingle();
  if (loadError) return Response.json({ ok: false, error: loadError.message }, { status: 400 });
  if (!existing) return Response.json({ ok: false, error: "ENROLLMENT_NOT_FOUND" }, { status: 404 });

  const { data, error } = await supabase
    .from("training_enrollments")
    .update({ status: "removed" })
    .eq("id", params.enrollmentId)
    .select()
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data });
}

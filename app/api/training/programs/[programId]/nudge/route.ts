/**
 * Training Program Nudge (/api/training/programs/[programId]/nudge)
 *
 * Functionality:
 * - POST stamps last_nudged_at on active enrollments, either for a list of learnerIds or all active learners.
 * - Staff or program TA only; requires learnerIds or allActive and caps learnerIds at 200.
 * - Returns the updated enrollment rows and the nudge timestamp.
 *
 * Notes:
 * - Zod nudgeSchema validates the body; writes training_enrollments.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffOrProgramTA } from "@/lib/supabase/roles";
import { z } from "zod";
import { validationError } from "@/lib/server/training-validation";

/** Request body: explicit learner ids and/or an "all active" flag. */
const nudgeSchema = z.object({
  learnerIds: z.array(z.string().uuid()).min(1).max(200).optional(),
  /** When true, nudge all active enrollments. */
  allActive: z.boolean().optional(),
});

/** Lightweight staff "nudge" — stamps last_nudged_at on enrollments. */
export async function POST(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaffOrProgramTA(supabase, params.programId);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = nudgeSchema.safeParse(body ?? {});
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  // Only active enrollments are eligible for nudging.
  const now = new Date().toISOString();
  let query = supabase
    .from("training_enrollments")
    .update({ last_nudged_at: now })
    .eq("program_id", params.programId)
    .eq("status", "active");

  // Scope to explicit learners, or all active when allActive is set.
  if (parsed.data.learnerIds?.length) {
    query = query.in("learner_id", parsed.data.learnerIds);
  } else if (!parsed.data.allActive) {
    return Response.json(
      { ok: false, error: "VALIDATION_ERROR", message: "learnerIds or allActive required" },
      { status: 400 }
    );
  }

  const { data, error } = await query.select("id, learner_id, last_nudged_at");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data, nudgedAt: now });
}

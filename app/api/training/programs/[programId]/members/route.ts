/**
 * Training Program Members (/api/training/programs/[programId]/members)
 *
 * Functionality:
 * - POST enrolls one email (invite schema) or a batch of emails (batch schema) as learner/TA for the program.
 * - Validation runs before the service-role check so offline tests can exercise 400 responses.
 * - Staff-only; existing users are reused, new users are invited, and removed enrollments are reactivated.
 *
 * Notes:
 * - serviceAdmin() builds a Supabase admin client for auth lookup/invites; guards live in training-program-guards.
 * - Reads/writes training_enrollments and reads profiles; returns per-email results for batch requests.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/roles";
import {
  trainingMemberBatchSchema,
  trainingMemberInviteSchema,
  validationError,
} from "@/lib/server/training-validation";
import {
  assertProgramAcceptsMembers,
  findAuthUserByEmail,
} from "@/lib/server/training-program-guards";

/** Build a service-role Supabase client when URL and key are configured; null otherwise. */
function serviceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolve or invite a user by email and upsert their enrollment for the program. */
async function enrollEmail(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  admin: NonNullable<ReturnType<typeof serviceAdmin>>,
  programId: string,
  email: string,
  role: "learner" | "ta"
) {
  // Reject invites when the program is missing or not accepting members.
  const gate = await assertProgramAcceptsMembers(supabase, programId);
  if (!gate.ok) {
    return { ok: false as const, error: gate.error, status: gate.error === "PROGRAM_NOT_FOUND" ? 404 : 400 };
  }

  let existingUser: { id: string; email?: string } | null;
  try {
    existingUser = await findAuthUserByEmail(admin, email);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "AUTH_LOOKUP_FAILED",
      status: 400,
    };
  }

  if (existingUser) {
    const { data: existingEnrollment } = await supabase
      .from("training_enrollments")
      .select("id, status")
      .eq("program_id", programId)
      .eq("learner_id", existingUser.id)
      .maybeSingle();

    if (existingEnrollment) {
      if (existingEnrollment.status === "removed") {
        const { data, error } = await supabase
          .from("training_enrollments")
          .update({ status: "active", role })
          .eq("id", existingEnrollment.id)
          .select("*, profiles:learner_id(id, display_name, role)")
          .single();
        if (error) return { ok: false as const, error: error.message, status: 400 };
        return { ok: true as const, data, reactivated: true, email };
      }
      return {
        ok: false as const,
        error: "ALREADY_ENROLLED",
        status: 409,
        data: existingEnrollment,
      };
    }
  }

  const invited = existingUser
    ? { data: { user: existingUser }, error: null as null }
    : await admin.auth.admin.inviteUserByEmail(email);
  const invitedUser = invited.data?.user;
  if (invited.error || !invitedUser) {
    const message = invited.error?.message ?? "INVITE_FAILED";
    const code = /already|registered|exists/i.test(message)
      ? "USER_EXISTS_LOOKUP_FAILED"
      : "INVITE_FAILED";
    return { ok: false as const, error: code, message, status: 400 };
  }

  // Upsert enrollment so re-invites stay idempotent per (program, learner).
  const { data, error } = await supabase
    .from("training_enrollments")
    .upsert(
      {
        program_id: programId,
        learner_id: invitedUser.id,
        role,
        status: "active",
      },
      { onConflict: "program_id,learner_id" }
    )
    .select("*, profiles:learner_id(id, display_name, role)")
    .single();
  if (error) return { ok: false as const, error: error.message, status: 400 };
  return {
    ok: true as const,
    data,
    invited: !existingUser,
    email,
  };
}

/** Enroll one or many learners/TAs by email; staff-only. */
export async function POST(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const body = await req.json().catch(() => null);

  // Validate before requiring service role so unit tests can cover 400s offline.
  if (body && Array.isArray(body.emails)) {
    const parsed = trainingMemberBatchSchema.safeParse(body);
    if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
  } else {
    const parsed = trainingMemberInviteSchema.safeParse(body);
    if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const admin = serviceAdmin();
  if (!supabase || !admin) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  // Staff-only: TAs and learners cannot add members.
  const auth = await requireStaff(supabase);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }

  // Batch invite: { emails: string[] }
  if (body && Array.isArray(body.emails)) {
    const parsed = trainingMemberBatchSchema.safeParse(body);
    if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
    const results = [];
    for (const email of parsed.data.emails) {
      results.push(await enrollEmail(supabase, admin, params.programId, email, parsed.data.role ?? "learner"));
    }
    return Response.json({ ok: true, data: results }, { status: 201 });
  }

  const parsed = trainingMemberInviteSchema.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  const result = await enrollEmail(
    supabase,
    admin,
    params.programId,
    parsed.data.email,
    parsed.data.role ?? "learner"
  );
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error, message: "message" in result ? result.message : undefined },
      { status: result.status }
    );
  }
  return Response.json(
    {
      ok: true,
      data: result.data,
      existing: "reactivated" in result ? false : undefined,
      reactivated: "reactivated" in result ? result.reactivated : false,
      invited: "invited" in result ? result.invited : false,
    },
    { status: 201 }
  );
}

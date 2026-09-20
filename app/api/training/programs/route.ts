/**
 * Training Programs (/api/training/programs)
 *
 * Functionality:
 * - GET lists training programs scoped by role (admin global, librarian org, TA own camps) with enrollments and learner profiles.
 * - POST creates a program as org staff, resolving the target organization and falling back through schema-compat inserts.
 * - Both handlers require an authenticated Supabase session; POST rejects TAs and callers outside the target organization.
 *
 * Notes:
 * - Uses requireStaff/requireOrgStaff/listStaffOrgIds/listTaProgramIds from lib/supabase/roles and training-validation schemas.
 * - Reads/writes training_programs plus training_enrollments/profiles; a service-role client enriches learner emails for staff only.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listStaffOrgIds,
  listTaProgramIds,
  requireOrgStaff,
  requireStaff,
} from "@/lib/supabase/roles";
import {
  programRowFromInput,
  trainingProgramSchema,
  validationError,
} from "@/lib/server/training-validation";

/** Attach learner emails to programs via the service-role auth admin (staff PII only). */
async function enrichEmails(
  programs: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url || !programs.length) return programs;
  try {
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const emailById = new Map<string, string>();
    for (let page = 1; page <= 10; page += 1) {
      const { data: users, error: usersError } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (usersError) break;
      for (const user of users.users) {
        if (user.email) emailById.set(user.id, user.email);
      }
      if (users.users.length < 200) break;
    }
    return programs.map((program) => ({
      ...program,
      training_enrollments: ((program.training_enrollments as Array<Record<string, unknown>>) ?? []).map(
        (enrollment) => ({
          ...enrollment,
          email: emailById.get(String(enrollment.learner_id)) ?? null,
        })
      ),
    }));
  } catch {
    return programs;
  }
}

/** List programs visible to the caller, scoped by staff role or TA assignments. */
export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  // Determine whether the caller is org/global staff (vs. a camp TA).
  const staff = await requireStaff(supabase);
  const isStaff = !staff.error;

  // Base query: programs with enrollments and learner profiles.
  let query = supabase
    .from("training_programs")
    .select("*, training_enrollments(*, profiles:learner_id(id, display_name, role))")
    .order("updated_at", { ascending: false });

  if (!isStaff) {
    const taProgramIds = await listTaProgramIds(supabase, user.id);
    if (taProgramIds.length === 0) {
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    query = query.in("id", taProgramIds);
  } else if (staff.role === "librarian") {
    // Multi-tenant: librarian only sees camps in their organizations (when table exists).
    const orgProbe = await supabase.from("organizations").select("id").limit(1);
    if (!orgProbe.error) {
      const orgIds = await listStaffOrgIds(supabase, user.id, staff.role);
      if (orgIds !== "all") {
        if (orgIds.length === 0) {
          return Response.json({ ok: true, data: [], access: "staff", scope: "org" });
        }
        query = query.in("organization_id", orgIds);
      }
    }
  }

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Emails: staff only (PII). TA sees display_name only.
  const programs = (data ?? []) as Array<Record<string, unknown>>;
  const enriched = isStaff ? await enrichEmails(programs) : programs;

  return Response.json({
    ok: true,
    data: enriched,
    access: isStaff ? "staff" : "ta",
    scope: isStaff && staff.role === "admin" ? "global" : isStaff ? "org" : "ta",
  });
}

/** Create camp — org staff only (not TA). */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const auth = await requireStaff(supabase);
  if (auth.error) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "FORBIDDEN" ? 403 : 401 });
  }
  // Parse and validate the create-program payload before touching auth scope.
  const body = await req.json().catch(() => null);
  const parsed = trainingProgramSchema.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  // Multi-tenant is optional until migration 180010 is applied.
  let multiTenant = true;
  let organizationId = parsed.data.organizationId ?? null;
  {
    const probe = await supabase.from("organizations").select("id").limit(1);
    if (probe.error) multiTenant = false;
  }

  if (multiTenant) {
    if (!organizationId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_org_id")
        .eq("id", auth.user!.id)
        .maybeSingle();
      organizationId = (profile?.default_org_id as string | null) ?? null;
    }
    if (!organizationId) {
      const orgIds = await listStaffOrgIds(supabase, auth.user!.id, auth.role);
      if (orgIds !== "all" && orgIds.length > 0) organizationId = orgIds[0];
    }
    if (!organizationId) {
      const { data: def } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", "default")
        .maybeSingle();
      organizationId = (def?.id as string | null) ?? null;
    }
    if (!organizationId) {
      return Response.json({ ok: false, error: "ORGANIZATION_REQUIRED" }, { status: 400 });
    }
    const orgAuth = await requireOrgStaff(supabase, organizationId);
    // Global admin may create even before membership row exists.
    if (orgAuth.error && auth.role !== "admin") {
      return Response.json({ ok: false, error: "ORG_FORBIDDEN" }, { status: 403 });
    }
  } else {
    organizationId = null;
  }

  const now = new Date().toISOString();
  // Core columns present since earliest training migration.
  const baseRow: Record<string, unknown> = {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    discipline: parsed.data.discipline ?? null,
    owner_id: auth.user!.id,
    created_at: now,
    updated_at: now,
  };

  // Extended columns from later migrations (lifecycle / multi-tenant).
  const extendedRow: Record<string, unknown> = {
    ...baseRow,
    ...programRowFromInput(
      { ...parsed.data, organizationId },
      { owner_id: auth.user!.id, updated_at: now }
    ),
    created_at: now,
  };
  if (!extendedRow.status) extendedRow.status = "draft";
  if (organizationId) extendedRow.organization_id = organizationId;
  else delete extendedRow.organization_id;

  // Insert the full row first; retry with base columns when the remote schema lags migrations.
  let { data, error } = await supabase
    .from("training_programs")
    .insert(extendedRow)
    .select()
    .single();

  // Backward-compat: strip unknown columns when remote schema lags migrations.
  if (error && /Could not find the .* column|schema cache|42703/i.test(error.message)) {
    ({ data, error } = await supabase
      .from("training_programs")
      .insert(baseRow)
      .select()
      .single());
  }
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data }, { status: 201 });
}

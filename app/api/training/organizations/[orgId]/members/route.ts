/**
 * Organization Members API (/api/training/organizations/[orgId]/members)
 *
 * Functionality:
 * - GET lists an organization's staff members, adding emails for admins and org admins.
 * - POST adds a member by email, inviting a new auth user when needed, and ensures staff profile roles.
 * - DELETE removes a member, preventing non-admins from removing themselves.
 * - All handlers require staff authentication, with permission limited to admins or org admins.
 *
 * Notes:
 * - Uses a service-role client for auth admin lookups; reads and writes `organization_members` and `profiles`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireOrgStaff, requireStaff } from "@/lib/supabase/roles";
import { findAuthUserByEmail } from "@/lib/server/training-program-guards";

/** Builds a service-role Supabase client for auth admin operations. */
function serviceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Returns whether the user may manage members of the given organization. */
async function canManageOrgMembers(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  orgId: string,
  globalRole: "librarian" | "admin"
): Promise<boolean> {
  // Global admins always may; others must hold the org_admin role.
  if (globalRole === "admin") return true;
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "org_admin";
}

/** List org staff members (admin or org_admin / librarian of that org). */
export async function GET(
  _req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireOrgStaff(supabase, params.orgId);
  if (auth.error) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.error === "FORBIDDEN" ? 403 : 401 }
    );
  }

  // Load members with their joined profile metadata.
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, user_id, role, created_at, profiles:user_id(id, display_name, role)")
    .eq("org_id", params.orgId)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Optional emails for admins/org_admin only.
  const canManage = await canManageOrgMembers(
    supabase,
    auth.user!.id,
    params.orgId,
    auth.role
  );
  const emailById = new Map<string, string>();
  if (canManage) {
    const admin = serviceAdmin();
    if (admin) {
      for (let page = 1; page <= 5; page += 1) {
        const { data: users } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        for (const u of users?.users ?? []) {
          if (u.email) emailById.set(u.id, u.email);
        }
        if ((users?.users.length ?? 0) < 200) break;
      }
    }
  }

  // Shape rows for the client, redacting emails unless the caller can manage.
  const rows = (data ?? []).map((row) => ({
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    displayName:
      (row.profiles as { display_name?: string | null } | null)?.display_name ?? null,
    profileRole: (row.profiles as { role?: string } | null)?.role ?? null,
    email: canManage ? emailById.get(row.user_id as string) ?? null : null,
  }));

  return Response.json({
    ok: true,
    data: rows,
    canManage,
  });
}

/** Add staff to organization by email (admin or org_admin). */
export async function POST(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await requireStaff(supabase);
  if (staff.error || !staff.user) {
    return Response.json(
      { ok: false, error: staff.error ?? "UNAUTHENTICATED" },
      { status: staff.error === "FORBIDDEN" ? 403 : 401 }
    );
  }
  if (!(await canManageOrgMembers(supabase, staff.user.id, params.orgId, staff.role))) {
    return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  // Validate the email and role before resolving the target user.
  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role =
    body?.role === "org_admin" || body?.role === "viewer" || body?.role === "librarian"
      ? body.role
      : "librarian";
  if (!email || !email.includes("@")) {
    return Response.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
  }

  // A service-role client is required to look up or invite auth users.
  const admin = serviceAdmin();
  if (!admin) {
    return Response.json({ ok: false, error: "SERVICE_ROLE_REQUIRED" }, { status: 503 });
  }

  // Resolve an existing auth user by email, or report a lookup failure.
  let user: { id: string; email?: string } | null;
  try {
    user = await findAuthUserByEmail(admin, email);
  } catch {
    return Response.json({ ok: false, error: "USER_EXISTS_LOOKUP_FAILED" }, { status: 400 });
  }
  if (!user) {
    // Invite creates auth user; profile may be created by trigger.
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (invErr || !invited.user) {
      return Response.json(
        { ok: false, error: invErr?.message ?? "INVITE_FAILED" },
        { status: 400 }
      );
    }
    user = { id: invited.user.id, email };
  }

  // Ensure profile can act as staff (do not demote admin).
  if (role === "librarian" || role === "org_admin") {
    const { data: existing } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!existing) {
      await supabase.from("profiles").insert({
        id: user.id,
        role: "librarian",
        display_name: email.split("@")[0],
      });
    } else if (existing.role !== "admin" && existing.role !== "librarian") {
      await supabase.from("profiles").update({ role: "librarian" }).eq("id", user.id);
    }
  }

  // Upsert the membership so re-adding an existing user just updates the role.
  const { data, error } = await supabase
    .from("organization_members")
    .upsert(
      {
        org_id: params.orgId,
        user_id: user.id,
        role,
      },
      { onConflict: "org_id,user_id" }
    )
    .select()
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data }, { status: 201 });
}

/** Remove member from organization. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await requireStaff(supabase);
  if (staff.error || !staff.user) {
    return Response.json(
      { ok: false, error: staff.error ?? "UNAUTHENTICATED" },
      { status: staff.error === "FORBIDDEN" ? 403 : 401 }
    );
  }
  if (!(await canManageOrgMembers(supabase, staff.user.id, params.orgId, staff.role))) {
    return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  // Require the target user id and block non-admin self-removal.
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return Response.json({ ok: false, error: "USER_ID_REQUIRED" }, { status: 400 });
  }
  if (userId === staff.user.id && staff.role !== "admin") {
    return Response.json({ ok: false, error: "CANNOT_REMOVE_SELF" }, { status: 400 });
  }

  // Remove the membership row for the given org and user.
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("org_id", params.orgId)
    .eq("user_id", userId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}

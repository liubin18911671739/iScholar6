/**
 * Supabase Role Guards (lib/supabase/roles.ts)
 *
 * Functionality:
 * - Defines global/camp/org role types plus the `StaffAuth` / `AuthError` result shapes.
 * - Resolves staff, org, program, and TA access through `require*` / `is*` async helpers.
 * - Scopes lookups via Supabase `profiles`, `organization_members`, and `training_enrollments`.
 *
 * Notes:
 * - Async helpers read the current user from the Supabase client; results are not cached.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

/** App-wide role stored on the user profile. */
export type GlobalRole = "learner" | "librarian" | "admin";
/** Role a learner holds inside a specific training camp. */
export type CampRole = "learner" | "ta";
/** Role inside an organization membership record. */
export type OrgMemberRole = "org_admin" | "librarian" | "viewer";

/** Successful staff authorization result. */
export type StaffAuth = {
  user: User;
  role: "librarian" | "admin";
  error: null;
};

/** Failed authorization result with a machine-readable reason. */
export type AuthError = {
  user: null;
  role: null;
  error: "UNAUTHENTICATED" | "FORBIDDEN";
};

/** Require a signed-in user whose global profile role is librarian or admin. */
export async function requireStaff(
  client: SupabaseClient
): Promise<StaffAuth | AuthError> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { user: null, role: null, error: "UNAUTHENTICATED" };
  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (error || !profile || !["librarian", "admin"].includes(profile.role)) {
    return { user: null, role: null, error: "FORBIDDEN" };
  }
  return { user, role: profile.role as "librarian" | "admin", error: null };
}

/** Org ids the user may manage camps for (admin → all; librarian → memberships). */
export async function listStaffOrgIds(
  client: SupabaseClient,
  userId: string,
  globalRole?: string | null
): Promise<string[] | "all"> {
  const role =
    globalRole ??
    (
      await client.from("profiles").select("role").eq("id", userId).maybeSingle()
    ).data?.role;
  if (role === "admin") return "all";

  const { data, error } = await client
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .in("role", ["org_admin", "librarian"]);
  if (error || !data) return [];
  return data.map((row) => row.org_id as string);
}

/** True when the user is a global admin or org-scoped staff member. */
export async function isOrgStaff(
  client: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role === "admin") return true;
  const { data, error } = await client
    .from("organization_members")
    .select("org_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .in("role", ["org_admin", "librarian"])
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * Staff who can manage a specific program (org-scoped librarian or global admin).
 * Falls back to classic requireStaff when program has no organization_id.
 */
export async function requireProgramStaff(
  client: SupabaseClient,
  programId: string
): Promise<
  | { user: User; role: "librarian" | "admin"; programId: string; organizationId: string | null; error: null }
  | AuthError
> {
  const staff = await requireStaff(client);
  if (staff.error || !staff.user) return staff;

  const { data: program } = await client
    .from("training_programs")
    .select("id, organization_id")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return { user: null, role: null, error: "FORBIDDEN" };

  const orgId = (program.organization_id as string | null) ?? null;
  if (staff.role === "admin" || !orgId) {
    return {
      user: staff.user,
      role: staff.role,
      programId,
      organizationId: orgId,
      error: null,
    };
  }

  if (await isOrgStaff(client, staff.user.id, orgId)) {
    return {
      user: staff.user,
      role: staff.role,
      programId,
      organizationId: orgId,
      error: null,
    };
  }
  return { user: null, role: null, error: "FORBIDDEN" };
}

/** Staff allowed to create/manage within an organization. */
export async function requireOrgStaff(
  client: SupabaseClient,
  organizationId: string
): Promise<
  | { user: User; role: "librarian" | "admin"; organizationId: string; error: null }
  | AuthError
> {
  const staff = await requireStaff(client);
  if (staff.error || !staff.user) return staff;
  if (staff.role === "admin" || (await isOrgStaff(client, staff.user.id, organizationId))) {
    return {
      user: staff.user,
      role: staff.role,
      organizationId,
      error: null,
    };
  }
  return { user: null, role: null, error: "FORBIDDEN" };
}

/** Active camp TA enrollments for the current user. */
export async function listTaProgramIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from("training_enrollments")
    .select("program_id")
    .eq("learner_id", userId)
    .eq("role", "ta")
    .eq("status", "active");
  if (error || !data) return [];
  return data.map((row) => row.program_id as string);
}

/** True when the user has an active TA enrollment for the program. */
export async function isProgramTA(
  client: SupabaseClient,
  userId: string,
  programId: string
): Promise<boolean> {
  // Prefer role+status filters; remotes without role column cannot have camp TAs.
  const { data, error } = await client
    .from("training_enrollments")
    .select("id")
    .eq("program_id", programId)
    .eq("learner_id", userId)
    .eq("role", "ta")
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    // Missing role/status columns → treat as no TA capability.
    if (/role|status|column|schema cache|42703/i.test(error.message)) return false;
    return false;
  }
  return Boolean(data);
}

/**
 * Org-scoped staff (or global admin) or active TA for the given program.
 * Use for review / read operational endpoints.
 */
export async function requireStaffOrProgramTA(
  client: SupabaseClient,
  programId: string
): Promise<
  | { user: User; role: "librarian" | "admin" | "ta"; programId: string; error: null }
  | AuthError
> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { user: null, role: null, error: "UNAUTHENTICATED" };

  const programStaff = await requireProgramStaff(client, programId);
  if (!programStaff.error && programStaff.user) {
    return {
      user: programStaff.user,
      role: programStaff.role,
      programId,
      error: null,
    };
  }

  if (await isProgramTA(client, user.id, programId)) {
    return { user, role: "ta", programId, error: null };
  }
  return { user: null, role: null, error: "FORBIDDEN" };
}

/**
 * Resolve access for review by submission id (staff or TA of that camp).
 */
export async function requireReviewerForSubmission(
  client: SupabaseClient,
  submissionId: string
): Promise<
  | {
      user: User;
      role: "librarian" | "admin" | "ta";
      programId: string;
      error: null;
    }
  | AuthError
> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { user: null, role: null, error: "UNAUTHENTICATED" };

  const { data: submission, error } = await client
    .from("training_submissions")
    .select("id, program_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (error || !submission) return { user: null, role: null, error: "FORBIDDEN" };

  return requireStaffOrProgramTA(client, submission.program_id as string);
}

/** True when user is global staff. */
export function isGlobalStaffRole(role: string | null | undefined): boolean {
  return role === "librarian" || role === "admin";
}

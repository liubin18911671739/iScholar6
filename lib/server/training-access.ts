/**
 * Training Access (lib/server/training-access.ts)
 *
 * Functionality:
 * - Re-exports staff/TA/reviewer auth guards from `@/lib/supabase/roles`.
 * - Builds a unified reviewer context for endpoints spanning multiple programs.
 * - Exposes a staff-only mutation guard alias.
 *
 * Notes:
 * - Staff have access to all programs; TAs are restricted to their program ids.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  isProgramTA,
  listTaProgramIds,
  requireStaff,
  requireStaffOrProgramTA,
  requireReviewerForSubmission,
  type AuthError,
} from "@/lib/supabase/roles";

export {
  requireStaff,
  requireStaffOrProgramTA,
  requireReviewerForSubmission,
  isProgramTA,
  listTaProgramIds,
};

/** Reviewer auth result: staff (all programs) or TA (scoped program ids), or an auth error. */
export type ReviewerContext =
  | {
      user: User;
      role: "librarian" | "admin" | "ta";
      /** When role is ta, restricted to these program ids. Empty when staff (all). */
      taProgramIds: string[];
      isStaff: boolean;
      error: null;
    }
  | AuthError;

/**
 * Auth for review-queue style endpoints that span multiple programs.
 * Staff → all programs; TA → only their TA camps.
 */
export async function requireReviewerContext(
  client: SupabaseClient
): Promise<ReviewerContext> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { user: null, role: null, error: "UNAUTHENTICATED" };

  const staff = await requireStaff(client);
  if (!staff.error && staff.user) {
    return {
      user: staff.user,
      role: staff.role,
      taProgramIds: [],
      isStaff: true,
      error: null,
    };
  }

  const taProgramIds = await listTaProgramIds(client, user.id);
  if (taProgramIds.length === 0) {
    return { user: null, role: null, error: "FORBIDDEN" };
  }
  return {
    user,
    role: "ta",
    taProgramIds,
    isStaff: false,
    error: null,
  };
}

/** Staff-only mutations (create camp, invite, curriculum, archive). */
export async function requireStaffOnly(client: SupabaseClient) {
  return requireStaff(client);
}

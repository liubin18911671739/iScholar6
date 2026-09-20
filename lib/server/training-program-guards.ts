/**
 * Training Program Guards (lib/server/training-program-guards.ts)
 *
 * Functionality:
 * - Loads training program rows with fallbacks for remotes missing lifecycle columns.
 * - Gates membership (invite/enroll) and submissions on program status and capacity.
 * - Looks up an auth user by email across paginated admin user lists.
 *
 * Notes:
 * - Reads `training_programs` and `training_enrollments` via the Supabase client.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Reason codes returned when a program cannot accept members/submissions. */
export type ProgramGateError =
  | "PROGRAM_NOT_FOUND"
  | "PROGRAM_ARCHIVED"
  | "PROGRAM_NOT_ACTIVE"
  | "PROGRAM_FULL";

/** Normalized training program row used by the guards. */
export type ProgramRow = {
  id: string;
  status: string;
  max_members: number | null;
  name: string;
};

/** Load a training program, falling back to base columns on legacy schemas. */
export async function loadProgram(
  client: SupabaseClient,
  programId: string
): Promise<{ program: ProgramRow | null; error: string | null }> {
  // Prefer full lifecycle columns; fall back for remotes lagging migrations.
  let { data, error } = await client
    .from("training_programs")
    .select("id, status, max_members, name")
    .eq("id", programId)
    .maybeSingle();
  if (error && /status|max_members|column|schema cache|42703/i.test(error.message)) {
    ({ data, error } = await client
      .from("training_programs")
      .select("id, name")
      .eq("id", programId)
      .maybeSingle());
    if (!error && data) {
      return {
        program: {
          id: data.id as string,
          name: data.name as string,
          status: "active",
          max_members: null,
        },
        error: null,
      };
    }
  }
  if (error) return { program: null, error: error.message };
  if (!data) return { program: null, error: null };
  return {
    program: {
      id: data.id as string,
      name: data.name as string,
      status: (data as { status?: string }).status ?? "active",
      max_members: (data as { max_members?: number | null }).max_members ?? null,
    },
    error: null,
  };
}

/** Blocks invite/enroll when program is archived or at capacity. */
export async function assertProgramAcceptsMembers(
  client: SupabaseClient,
  programId: string
): Promise<{ ok: true; program: ProgramRow } | { ok: false; error: ProgramGateError | string }> {
  const { program, error } = await loadProgram(client, programId);
  if (error) return { ok: false, error };
  if (!program) return { ok: false, error: "PROGRAM_NOT_FOUND" };
  if (program.status === "archived") return { ok: false, error: "PROGRAM_ARCHIVED" };

  if (program.max_members != null) {
    const { count, error: countError } = await client
      .from("training_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId)
      .neq("status", "removed");
    if (countError) return { ok: false, error: countError.message };
    if ((count ?? 0) >= program.max_members) {
      return { ok: false, error: "PROGRAM_FULL" };
    }
  }

  return { ok: true, program };
}

/** Blocks new submissions when program is archived (draft may allow staff testing). */
export async function assertProgramAcceptsSubmissions(
  client: SupabaseClient,
  programId: string
): Promise<{ ok: true; program: ProgramRow } | { ok: false; error: ProgramGateError | string }> {
  const { program, error } = await loadProgram(client, programId);
  if (error) return { ok: false, error };
  if (!program) return { ok: false, error: "PROGRAM_NOT_FOUND" };
  if (program.status === "archived") return { ok: false, error: "PROGRAM_ARCHIVED" };
  return { ok: true, program };
}

/** Find an auth user by email by paging through the admin user list. */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<{ id: string; email?: string } | null> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data: users, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = users.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return { id: found.id, email: found.email };
    if (users.users.length < 200) break;
  }
  return null;
}

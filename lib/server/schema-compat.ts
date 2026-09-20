/**
 * Schema Compat (lib/server/schema-compat.ts)
 *
 * Functionality:
 * - Detects PostgREST/Supabase errors for missing relations/columns via message patterns.
 * - Loads a user's program enrollment while tolerating absent lifecycle columns.
 * - Normalizes legacy enrollment rows into a consistent `{ id, role?, status? }` shape.
 *
 * Notes:
 * - Helps APIs keep working when a remote database lags pending migrations.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** True when an error message indicates a missing table/relation. */
export function isMissingRelationError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /could not find the table/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /PGRST205/i.test(message) ||
    /schema cache/i.test(message)
  );
}

/** True when an error message indicates a missing column. */
export function isMissingColumnError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /column .* does not exist/i.test(message) ||
    /Could not find the .* column/i.test(message) ||
    /42703/.test(message)
  );
}

/**
 * Load enrollment for a user in a program with optional role.
 * Tolerates missing `role` / `status` columns and missing `removed` status.
 */
export async function loadEnrollmentCompat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (table: string) => any },
  programId: string,
  userId: string
): Promise<{ id: string; role?: string; status?: string } | null> {
  // Prefer modern select; fall back when columns missing.
  const attempts = [
    () =>
      client
        .from("training_enrollments")
        .select("id, role, status")
        .eq("program_id", programId)
        .eq("learner_id", userId)
        .maybeSingle(),
    () =>
      client
        .from("training_enrollments")
        .select("id, status")
        .eq("program_id", programId)
        .eq("learner_id", userId)
        .maybeSingle(),
    () =>
      client
        .from("training_enrollments")
        .select("id")
        .eq("program_id", programId)
        .eq("learner_id", userId)
        .maybeSingle(),
  ];

  for (const run of attempts) {
    const { data, error } = await run();
    if (error) {
      if (isMissingColumnError(error.message) || isMissingRelationError(error.message)) {
        continue;
      }
      return null;
    }
    if (!data) return null;
    if ((data as { status?: string }).status === "removed") return null;
    return data as { id: string; role?: string; status?: string };
  }
  return null;
}

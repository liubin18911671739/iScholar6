/**
 * Auth user lookup (lib/auth/users.ts)
 *
 * Functionality:
 * - Reads credential users from the `users` table via a narrow Postgres pool.
 * - Owned by the web container only; the Python backend owns all domain tables.
 *
 * Notes:
 * - Returns null when `AUTH_DATABASE_URL` is unset (build-time / local fallback).
 */

import { randomUUID } from "crypto";
import { Pool } from "pg";
import { hashPassword } from "@/lib/auth/password";

/** Row shape returned for credential authentication. */
export interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  role: string;
}

let pool: Pool | null = null;

function getPool(): Pool | null {
  const connectionString = process.env.AUTH_DATABASE_URL;
  if (!connectionString) return null;
  if (!pool) pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  return pool;
}

/** Look up a credential user by email, case-insensitively. */
export async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const client = getPool();
  if (!client) return null;
  const { rows } = await client.query<AuthUserRow>(
    "SELECT id, email, name, password_hash, role FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [email]
  );
  return rows[0] ?? null;
}

/**
 * Find a credential user by email, or create one with a random placeholder
 * password (the real password is set when the invite is accepted).
 */
export async function findOrCreateUserByEmail(
  email: string,
  role = "learner"
): Promise<{ id: string; email: string; created: boolean } | null> {
  const client = getPool();
  if (!client) return null;
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, email: existing.email, created: false };
  // Placeholder hash; overwritten via the invite-accept flow.
  const placeholder = await hashPassword(randomUUID());
  const { rows } = await client.query<{ id: string; email: string }>(
    "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $1, $2, $3) RETURNING id, email",
    [email.trim(), placeholder, role]
  );
  return { id: rows[0].id, email: rows[0].email, created: true };
}

/** Set a user's password (invite acceptance). Returns false when the user is unknown. */
export async function setUserPassword(email: string, password: string): Promise<boolean> {
  const client = getPool();
  if (!client) return false;
  const hash = await hashPassword(password);
  const result = await client.query(
    "UPDATE users SET password_hash = $2, updated_at = now() WHERE lower(email) = lower($1)",
    [email.trim(), hash]
  );
  return (result.rowCount ?? 0) > 0;
}

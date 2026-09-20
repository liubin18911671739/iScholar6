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

import { Pool } from "pg";

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
    "SELECT id, email, name, password_hash, role FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  return rows[0] ?? null;
}

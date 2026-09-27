/**
 * Playwright global setup: seed Auth.js credential users.
 *
 * Runs once before the suite. Connects to the host-reachable Postgres, upserts
 * the E2E staff + learner users with a bcrypt password hash, and fails fast
 * with an actionable message when the database is unreachable.
 */

import bcrypt from "bcryptjs";
import { Pool } from "pg";

import { E2E_LEARNER, E2E_STAFF, e2eAuthDatabaseUrl } from "./helpers/credentials";

export default async function globalSetup(): Promise<void> {
  const connectionString = e2eAuthDatabaseUrl();
  const pool = new Pool({ connectionString, max: 2 });
  try {
    const passwordHash = await bcrypt.hash(E2E_STAFF.password, 12);
    for (const user of [E2E_STAFF, E2E_LEARNER]) {
      await pool.query(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               role = EXCLUDED.role,
               name = EXCLUDED.name`,
        [user.email, user.name, passwordHash, user.role]
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[e2e] Could not seed Auth.js users at ${connectionString}.\n` +
        `Start Postgres first: docker compose up -d --wait postgres\n${detail}`
    );
  } finally {
    await pool.end();
  }
}

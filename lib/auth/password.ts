/**
 * Password hashing helpers (lib/auth/password.ts)
 *
 * Functionality:
 * - bcrypt hash/verify used by the Auth.js Credentials provider and seed scripts.
 */

import bcrypt from "bcryptjs";

const COST = 12;

/** Hash a plaintext password for storage. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Verify a plaintext password against a stored hash. */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

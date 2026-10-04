/**
 * Auth.js configuration (lib/auth.ts)
 *
 * Functionality:
 * - Email/password credential authentication backed by the `users` table.
 * - JWT sessions; carries user id and global role into the session.
 * - Exposes `handlers`, `auth`, `signIn`, `signOut` for the app router.
 *
 * Notes:
 * - Uses a narrow direct Postgres connection for auth tables only; all domain
 *   data access belongs to the Python backend.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "@/lib/auth.config";
import { findUserByEmail } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";

// Process-local credential throttle: caps online password guessing per email.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

/** True once >= LOGIN_MAX_ATTEMPTS *failed* attempts within the window. */
function tooManyLoginAttempts(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

/** Count a failed password attempt (successful logins reset the counter). */
function registerFailedLogin(email: string): void {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        if (tooManyLoginAttempts(email)) {
          console.warn("[auth] login throttled", { email });
          return null;
        }
        const user = await findUserByEmail(email);
        // Uniform small delay on failure to slow credential stuffing.
        if (!user) {
          registerFailedLogin(email);
          await new Promise((resolve) => setTimeout(resolve, 150));
          return null;
        }
        if (!(await verifyPassword(password, user.password_hash))) {
          registerFailedLogin(email);
          await new Promise((resolve) => setTimeout(resolve, 150));
          return null;
        }
        loginAttempts.delete(email.toLowerCase());
        return { id: user.id, email: user.email, name: user.name ?? user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? "learner";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.uid === "string" ? token.uid : "";
        session.user.role = typeof token.role === "string" ? token.role : "learner";
      }
      return session;
    },
  },
});

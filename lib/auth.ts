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
import { findUserByEmail } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
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
        const user = await findUserByEmail(email);
        if (!user) return null;
        if (!(await verifyPassword(password, user.password_hash))) return null;
        return { id: user.id, email: user.email, name: user.name ?? user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
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

/**
 * Edge-safe Auth.js configuration (lib/auth.config.ts)
 *
 * Functionality:
 * - Holds the Auth.js options that are safe for the Edge runtime: pages,
 *   session strategy, trustHost, and the middleware `authorized` gate.
 *
 * Notes:
 * - Providers and callbacks that touch Node-only modules (`pg`, `bcryptjs`)
 *   live in `lib/auth.ts`. `middleware.ts` must import this file, never
 *   `lib/auth.ts`, or the Edge bundle fails to compile.
 */

import type { NextAuthConfig } from "next-auth";

const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    /** Middleware gate: only authenticated users reach protected routes. */
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;

export default authConfig;

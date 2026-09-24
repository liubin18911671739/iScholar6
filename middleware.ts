/**
 * Auth.js middleware (middleware.ts)
 *
 * Functionality:
 * - Gates the authenticated app routes on the Edge runtime before they render.
 * - Redirects signed-out users to `/login` via the `authorized` callback.
 *
 * Notes:
 * - Imports the edge-safe `lib/auth.config.ts`; never `lib/auth.ts`, which pulls
 *   in Node-only modules (`pg`, `bcryptjs`).
 * - API routes are excluded; they enforce their own auth in request guards.
 */

import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/settings/:path*",
    "/tools/:path*",
    "/training/:path*",
  ],
};

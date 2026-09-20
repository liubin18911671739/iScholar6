/**
 * Supabase Server Client (lib/supabase/server.ts)
 *
 * Functionality:
 * - Creates a cookie-aware Supabase SSR client for server components and route handlers.
 * - Reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the environment.
 * - Adapts Next.js `cookies()` into the Supabase cookie get/set interface.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Create a Supabase server client, or `null` when env vars are missing. */
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
}

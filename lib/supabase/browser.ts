/**
 * Supabase Browser (lib/supabase/browser.ts)
 *
 * Functionality:
 * - Creates a Supabase browser client from public env vars.
 * - Returns `null` when the URL or anon key is not configured.
 *
 * Notes:
 * - Uses `@supabase/ssr` so auth state is shared with server components/route handlers.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createBrowserClient } from "@supabase/ssr";

/** Create a browser Supabase client, or `null` when env vars are missing. */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

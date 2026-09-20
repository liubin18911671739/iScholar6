/**
 * Training Organizations API (/api/training/organizations)
 *
 * Functionality:
 * - GET lists organizations visible to the current staff user: all for admins, membership-scoped for librarians.
 * - POST lets a global admin create a new organization from a name and derived or explicit slug.
 * - Both handlers require a configured Supabase client and staff authentication.
 *
 * Notes:
 * - Reads `organization_members` and `organizations`, with roles resolved by `requireStaff`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/roles";

/** List organizations visible to the current staff user. */
export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireStaff(supabase);
  if (auth.error) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.error === "FORBIDDEN" ? 403 : 401 }
    );
  }

  // Load the caller's memberships to scope non-admin results.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("org_id, role, organizations:org_id(id, name, slug)")
    .eq("user_id", auth.user!.id);

  // Admins can see every organization.
  if (auth.role === "admin") {
    const { data: all, error } = await supabase
      .from("organizations")
      .select("id, name, slug, created_at")
      .order("name");
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({
      ok: true,
      data: all ?? [],
      access: "admin",
    });
  }

  // Flatten joined organization rows and drop any without a resolved org.
  const orgs = (memberships ?? [])
    .map((m) => {
      const raw = m.organizations as
        | { id: string; name: string; slug: string }
        | { id: string; name: string; slug: string }[]
        | null;
      const org = Array.isArray(raw) ? raw[0] : raw;
      if (!org?.id) return null;
      return { id: org.id, name: org.name, slug: org.slug, memberRole: m.role as string };
    })
    .filter((row): row is { id: string; name: string; slug: string; memberRole: string } => Boolean(row));

  return Response.json({
    ok: true,
    data: orgs,
    access: "librarian",
  });
}

/** Global admin creates a new organization. */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireStaff(supabase);
  if (auth.error || auth.role !== "admin") {
    return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  // Parse the name and derive a URL-safe slug when one is not supplied.
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug =
    typeof body?.slug === "string"
      ? body.slug.trim().toLowerCase()
      : name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48);
  if (!name || !slug) {
    return Response.json({ ok: false, error: "INVALID_ORG" }, { status: 400 });
  }

  // Persist the new organization and return the created row.
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name, slug })
    .select()
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data }, { status: 201 });
}

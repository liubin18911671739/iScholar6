/**
 * Training Task Packs (/api/training/task-packs)
 *
 * Functionality:
 * - GET lists builtin catalog tasks plus stored task packs for any authenticated user.
 * - POST uploads/upserts a validated task pack, storing its manifest/content hash and replacing its task definitions.
 * - POST is staff-only; the owning organization is resolved from the request, the caller's staff orgs, or the default org.
 *
 * Notes:
 * - parseTrainingTaskPackJson, packToDefinitionRows/simpleContentHash, listBuiltinCatalog.
 * - Writes training_task_packs and training_task_definitions.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listStaffOrgIds, requireStaff } from "@/lib/supabase/roles";
import { parseTrainingTaskPackJson } from "@/lib/training/task-pack-schema";
import { packToDefinitionRows, simpleContentHash } from "@/lib/training/remote-packs";
import { listBuiltinCatalog } from "@/lib/training/task-catalog";

/** List builtin catalog tasks and stored task packs for the authenticated user. */
export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // Load stored packs; the builtin catalog is always included in the response.
  const { data: packs, error } = await supabase
    .from("training_task_packs")
    .select("id, pack_key, name, description, version, source, content_hash, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    data: {
      builtin: listBuiltinCatalog().map((t) => ({
        id: t.id,
        title: t.title,
        agent: t.agent,
        dimension: t.dimension,
        requiresReview: t.requiresReview,
        source: "builtin",
      })),
      packs: packs ?? [],
    },
  });
}

/** Upload or update a task pack and refresh its task definitions; staff-only. */
export async function POST(req: NextRequest) {
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

  // Validate the uploaded pack manifest before persisting anything.
  const body = await req.json().catch(() => null);
  const parsed = parseTrainingTaskPackJson(body?.pack ?? body);
  if (!parsed.ok) {
    return Response.json(
      { ok: false, error: parsed.error, issues: parsed.issues },
      { status: 400 }
    );
  }
  const pack = parsed.pack;
  const contentHash = await simpleContentHash(JSON.stringify(pack));
  const now = new Date().toISOString();

  // Resolve the owning organization from the request, staff orgs, or the default org.
  let organizationId: string | null =
    typeof body?.organizationId === "string" ? body.organizationId : null;
  if (!organizationId) {
    const orgIds = await listStaffOrgIds(supabase, auth.user!.id, auth.role);
    if (orgIds !== "all" && orgIds.length > 0) organizationId = orgIds[0];
  }
  if (!organizationId) {
    const { data: def } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "default")
      .maybeSingle();
    organizationId = (def?.id as string | null) ?? null;
  }

  const { data: row, error } = await supabase
    .from("training_task_packs")
    .upsert(
      {
        pack_key: pack.key,
        name: pack.name,
        description: pack.description ?? null,
        version: pack.version,
        source: "upload",
        manifest: pack,
        content_hash: contentHash,
        organization_id: organizationId,
        created_by: auth.user!.id,
        updated_at: now,
      },
      { onConflict: "pack_key" }
    )
    .select()
    .single();
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Replace definitions for this pack
  await supabase.from("training_task_definitions").delete().eq("pack_id", row.id);
  const defs = packToDefinitionRows(row.id as string, pack);
  if (defs.length > 0) {
    const { error: defError } = await supabase.from("training_task_definitions").insert(defs);
    if (defError) {
      return Response.json({ ok: false, error: defError.message }, { status: 400 });
    }
  }

  return Response.json({ ok: true, data: row }, { status: 201 });
}

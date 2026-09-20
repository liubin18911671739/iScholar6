/**
 * Training Program LMS Link (/api/training/programs/[programId]/lms/link)
 *
 * Functionality:
 * - GET returns the program's LMS/LTI link with secrets masked; PUT upserts the link; DELETE removes it.
 * - Staff-only via requireProgramStaff; enabling requires client id, token url, line item url, and credentials per auth method.
 * - Secrets omitted on update are preserved from the existing row.
 *
 * Notes:
 * - maskSecret from lib/lms/lti/ags; reads/writes the training_lms_links table.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireProgramStaff } from "@/lib/supabase/roles";
import { maskSecret } from "@/lib/lms/lti/ags";

/** Shape a link row for clients, masking the secret and exposing only "has" flags. */
function publicLinkRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    programId: row.program_id,
    platform: row.platform,
    enabled: row.enabled,
    issuer: row.issuer,
    clientId: row.client_id,
    clientSecret: maskSecret(row.client_secret as string | null),
    hasClientSecret: Boolean(row.client_secret),
    tokenUrl: row.token_url,
    agsLineitemUrl: row.ags_lineitem_url,
    deploymentId: row.deployment_id,
    authMethod: row.auth_method,
    hasPrivateKey: Boolean(row.private_key_pem),
    lastPushAt: row.last_push_at,
    lastPushStatus: row.last_push_status,
    lastPushError: row.last_push_error,
    updatedAt: row.updated_at,
  };
}

/** Read the program's LMS link, if any; staff-only. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireProgramStaff(supabase, params.programId);
  if (auth.error) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.error === "FORBIDDEN" ? 403 : 401 }
    );
  }

  const { data, error } = await supabase
    .from("training_lms_links")
    .select("*")
    .eq("program_id", params.programId)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({
    ok: true,
    data: data ? publicLinkRow(data as Record<string, unknown>) : null,
  });
}

/** Upsert LMS/LTI AGS link for a camp (staff). Secrets optional on update if already set. */
export async function PUT(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireProgramStaff(supabase, params.programId);
  if (auth.error) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.error === "FORBIDDEN" ? 403 : 401 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const platform =
    body.platform === "moodle" || body.platform === "generic" || body.platform === "canvas"
      ? body.platform
      : "canvas";
  const authMethod =
    body.authMethod === "client_secret_basic" ||
    body.authMethod === "private_key_jwt" ||
    body.authMethod === "client_secret_post"
      ? body.authMethod
      : "client_secret_post";

  // Load existing secrets so omitted fields are retained on update.
  const { data: existing } = await supabase
    .from("training_lms_links")
    .select("client_secret, private_key_pem")
    .eq("program_id", params.programId)
    .maybeSingle();

  const clientSecret =
    typeof body.clientSecret === "string" && body.clientSecret.trim()
      ? body.clientSecret.trim()
      : (existing?.client_secret as string | null) ?? null;
  const privateKeyPem =
    typeof body.privateKeyPem === "string" && body.privateKeyPem.trim()
      ? body.privateKeyPem.trim()
      : (existing?.private_key_pem as string | null) ?? null;

  const row = {
    program_id: params.programId,
    platform,
    enabled: Boolean(body.enabled),
    issuer: typeof body.issuer === "string" ? body.issuer.trim() || null : null,
    client_id: typeof body.clientId === "string" ? body.clientId.trim() || null : null,
    client_secret: clientSecret,
    token_url: typeof body.tokenUrl === "string" ? body.tokenUrl.trim() || null : null,
    ags_lineitem_url:
      typeof body.agsLineitemUrl === "string" ? body.agsLineitemUrl.trim() || null : null,
    deployment_id:
      typeof body.deploymentId === "string" ? body.deploymentId.trim() || null : null,
    auth_method: authMethod,
    private_key_pem: privateKeyPem,
    updated_at: new Date().toISOString(),
  };

  // Enabling a link requires the full AGS configuration.
  if (row.enabled && (!row.client_id || !row.token_url || !row.ags_lineitem_url)) {
    return Response.json(
      { ok: false, error: "LMS_CONFIG_INCOMPLETE" },
      { status: 400 }
    );
  }
  if (
    row.enabled &&
    authMethod !== "private_key_jwt" &&
    !row.client_secret
  ) {
    return Response.json({ ok: false, error: "CLIENT_SECRET_REQUIRED" }, { status: 400 });
  }
  if (row.enabled && authMethod === "private_key_jwt" && !row.private_key_pem) {
    return Response.json({ ok: false, error: "PRIVATE_KEY_REQUIRED" }, { status: 400 });
  }

  // Upsert exactly one link row per program.
  const { data, error } = await supabase
    .from("training_lms_links")
    .upsert(row, { onConflict: "program_id" })
    .select()
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, data: publicLinkRow(data as Record<string, unknown>) });
}

/** Remove the program's LMS link; staff-only. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireProgramStaff(supabase, params.programId);
  if (auth.error) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.error === "FORBIDDEN" ? 403 : 401 }
    );
  }
  const { error } = await supabase
    .from("training_lms_links")
    .delete()
    .eq("program_id", params.programId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}

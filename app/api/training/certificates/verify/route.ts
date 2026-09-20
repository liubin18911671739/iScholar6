/**
 * Certificate Verify API (/api/training/certificates/verify)
 *
 * Functionality:
 * - GET verifies a certificate `hash` query parameter against the stored payload in `training_certificates`.
 * - Returns redacted metadata only; requires a configured Supabase client and a hash of at least 16 characters.
 * - Responds with `valid: false` rather than an error when no matching certificate exists.
 *
 * Notes:
 * - Re-hashes the stored payload via `verifyCertificateHash` to detect tampering.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type CertificatePayloadV1,
  verifyCertificateHash,
} from "@/lib/training/certificate";

/**
 * Public-ish verify: anyone authenticated can check a hash against stored payload.
 * Returns redacted metadata only.
 */
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  // Require a normalized hash parameter before querying.
  const hash = new URL(req.url).searchParams.get("hash")?.toLowerCase();
  if (!hash || hash.length < 16) {
    return Response.json({ ok: false, error: "HASH_REQUIRED" }, { status: 400 });
  }

  // Look up the certificate row by its content hash.
  const { data, error } = await supabase
    .from("training_certificates")
    .select("id, content_hash, payload, issued_at, program_id")
    .eq("content_hash", hash)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) {
    return Response.json({ ok: true, valid: false });
  }

  // Re-hash the stored payload to confirm the certificate was not tampered with.
  const payload = data.payload as CertificatePayloadV1;
  const match = await verifyCertificateHash(payload, data.content_hash as string);

  return Response.json({
    ok: true,
    valid: match,
    data: match
      ? {
          programName: payload.programName,
          displayName: payload.displayName,
          completedAt: payload.completedAt,
          issuer: payload.issuer,
          taskCount: payload.completedTaskIds?.length ?? 0,
          issuedAt: data.issued_at,
          contentHash: data.content_hash,
        }
      : null,
  });
}

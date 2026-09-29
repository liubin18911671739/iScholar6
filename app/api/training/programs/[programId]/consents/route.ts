/**
 * Training Program Consents (/api/training/programs/[programId]/consents)
 *
 * Functionality:
 * - GET lists AI-consent audit rows for the program (backend `ai_consents_v2`).
 * - Delegates authorization (staff or program TA) to the backend, which masks
 *   learner ids for TAs.
 *
 * Notes:
 * - Signed BFF call to `/v1/training/programs/{id}/consents`; no Supabase reads.
 *
 * @author mrpi
 * @date 2026-09-29
 */

import { NextRequest } from "next/server";
import { backendIdentityHeaders, backendUrl } from "@/lib/server/backend";

/** Shape returned by the backend staff consent endpoint. */
interface BackendConsentAudit {
  consents?: Array<{
    id: string;
    purpose: string;
    redactionConfirmed: boolean;
    sensitiveScan?: { total?: number };
    [key: string]: unknown;
  }>;
  stats?: { total?: number; redactionConfirmed?: number; sensitiveScanTotal?: number };
  masked?: boolean;
}

/** Lists a program's consent audit rows for staff or the program TA. */
export async function GET(
  req: NextRequest,
  { params }: { params: { programId: string } }
) {
  const identity = await backendIdentityHeaders();
  if (!identity) {
    return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const purpose = url.searchParams.get("purpose");
  const query = new URLSearchParams();
  if (purpose) query.set("purpose", purpose);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  let response: Response;
  try {
    response = await fetch(
      backendUrl(`/v1/training/programs/${encodeURIComponent(params.programId)}/consents${suffix}`),
      { headers: identity, cache: "no-store" }
    );
  } catch {
    return Response.json({ ok: false, error: "BACKEND_UNAVAILABLE" }, { status: 503 });
  }
  if (!response.ok) {
    return Response.json({ ok: false, error: "LOAD_FAILED" }, { status: response.status });
  }

  const payload = (await response.json().catch(() => null)) as { data?: BackendConsentAudit } | null;
  const body = payload?.data ?? {};
  const consents = body.consents ?? [];
  const stats = body.stats ?? {};

  return Response.json({
    ok: true,
    data: consents,
    stats: {
      total: stats.total ?? consents.length,
      trainingSubmit: consents.filter((row) => row.purpose === "training_submit").length,
      redactionConfirmed: stats.redactionConfirmed ?? 0,
      hadSensitiveAtScan: consents.filter((row) => Number(row.sensitiveScan?.total ?? 0) > 0).length,
    },
    access: body.masked ? "ta" : "staff",
    page: 1,
    pageSize: consents.length,
    total: stats.total ?? consents.length,
  });
}

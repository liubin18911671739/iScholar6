/**
 * Training Program LMS Push (/api/training/programs/[programId]/lms/push)
 *
 * Functionality:
 * - POST pushes an AGS gradebook to the linked LMS line item, optionally as a dry run, using stored credentials.
 * - Body accepts { dryRun?, userIdMap? } to remap learner ids to LMS user ids; staff-only.
 * - Returns 502 with per-user errors on failure and records last_push_at/status/error on the link.
 *
 * Notes:
 * - loadLearners aggregates enrollment/submission/review scores; pushGradebookToAgs performs the AGS call.
 * - Reads training_enrollments/submissions/reviews and writes training_lms_links.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireProgramStaff } from "@/lib/supabase/roles";
import { pushGradebookToAgs, type LmsLinkCredentials } from "@/lib/lms/lti/ags";
import type { GradebookLearner } from "@/lib/lms/gradebook";

/** Build a service-role Supabase client for optional email enrichment; null when unconfigured. */
function serviceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Aggregate per-learner task scores and overall average for the AGS payload. */
async function loadLearners(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  programId: string,
  includeEmail: boolean
): Promise<GradebookLearner[]> {
  const [{ data: enrollments }, { data: submissions }] = await Promise.all([
    supabase
      .from("training_enrollments")
      .select("learner_id, status, profiles:learner_id(display_name)")
      .eq("program_id", programId)
      .neq("status", "removed"),
    supabase
      .from("training_submissions")
      .select("id, task_id, learner_id, status")
      .eq("program_id", programId),
  ]);

  const subIds = (submissions ?? []).map((s) => s.id as string);
  const { data: reviews } = subIds.length
    ? await supabase
        .from("training_reviews")
        .select("submission_id, score, created_at")
        .in("submission_id", subIds)
    : { data: [] as Array<Record<string, unknown>> };

  const scoreBySub = new Map<string, number | null>();
  for (const r of [...(reviews ?? [])].sort(
    (a, b) =>
      new Date(b.created_at as string).getTime() -
      new Date(a.created_at as string).getTime()
  )) {
    const key = r.submission_id as string;
    if (!scoreBySub.has(key)) scoreBySub.set(key, (r.score as number | null) ?? null);
  }

  const emailById = new Map<string, string>();
  if (includeEmail) {
    const admin = serviceAdmin();
    if (admin) {
      for (let page = 1; page <= 5; page += 1) {
        const { data: users } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        for (const u of users?.users ?? []) {
          if (u.email) emailById.set(u.id, u.email);
        }
        if ((users?.users.length ?? 0) < 200) break;
      }
    }
  }

  const taskIds = Array.from(
    new Set((submissions ?? []).map((s) => s.task_id as string))
  );

  return (enrollments ?? []).map((e) => {
    const learnerId = e.learner_id as string;
    const taskScores: Record<string, number | null> = {};
    let sum = 0;
    let n = 0;
    for (const taskId of taskIds) {
      const sub = (submissions ?? []).find(
        (s) => s.learner_id === learnerId && s.task_id === taskId
      );
      const score = sub ? scoreBySub.get(sub.id as string) ?? null : null;
      taskScores[taskId] = score;
      if (typeof score === "number") {
        sum += score;
        n += 1;
      }
    }
    return {
      learnerId,
      displayName:
        (e.profiles as { display_name?: string | null } | null)?.display_name ?? null,
      email: includeEmail ? emailById.get(learnerId) ?? null : null,
      taskScores,
      overall: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
      status: e.status as string,
      completedAt: null,
    };
  });
}

/**
 * Staff-initiated AGS score push to the linked LMS line item.
 * Body: { dryRun?: boolean, userIdMap?: Record<string,string> }
 */
export async function POST(
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

  const body = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun);
  const userIdMap =
    body?.userIdMap && typeof body.userIdMap === "object"
      ? (body.userIdMap as Record<string, string>)
      : undefined;

  // Load the program's LMS link and require it to be enabled and complete.
  const { data: link, error: linkError } = await supabase
    .from("training_lms_links")
    .select("*")
    .eq("program_id", params.programId)
    .maybeSingle();
  if (linkError) {
    return Response.json({ ok: false, error: linkError.message }, { status: 500 });
  }
  if (!link || !link.enabled) {
    return Response.json({ ok: false, error: "LMS_LINK_DISABLED" }, { status: 400 });
  }
  if (!link.client_id || !link.token_url || !link.ags_lineitem_url) {
    return Response.json({ ok: false, error: "LMS_CONFIG_INCOMPLETE" }, { status: 400 });
  }

  // Assemble AGS credentials from the stored link.
  const credentials: LmsLinkCredentials = {
    platform: link.platform as string,
    clientId: link.client_id as string,
    clientSecret: (link.client_secret as string | null) ?? null,
    tokenUrl: link.token_url as string,
    agsLineitemUrl: link.ags_lineitem_url as string,
    authMethod: (link.auth_method as LmsLinkCredentials["authMethod"]) ?? "client_secret_post",
    privateKeyPem: (link.private_key_pem as string | null) ?? null,
    issuer: (link.issuer as string | null) ?? null,
  };

  const learners = await loadLearners(supabase, params.programId, false);
  const result = await pushGradebookToAgs({
    credentials,
    learners,
    userIdMap,
    dryRun,
  });

  // Persist the push outcome (status and truncated errors) on the link.
  await supabase
    .from("training_lms_links")
    .update({
      last_push_at: new Date().toISOString(),
      last_push_status: result.ok ? (dryRun ? "dry_run_ok" : "ok") : "error",
      last_push_error: result.ok
        ? null
        : result.errors.map((e) => `${e.userId}:${e.error}`).join("; ").slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("program_id", params.programId);

  return Response.json(
    {
      ok: result.ok,
      data: result,
      dryRun,
    },
    { status: result.ok ? 200 : 502 }
  );
}

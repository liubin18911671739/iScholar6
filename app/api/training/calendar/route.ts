/**
 * Training Calendar API (/api/training/calendar)
 *
 * Functionality:
 * - GET returns a month grid plus due-task events for training programs the caller can access.
 * - Staff are scoped by role (librarians by organization); TAs see only their assigned programs.
 * - Accepts `year` and `month` query parameters, defaulting to the current month.
 *
 * Notes:
 * - Joins `training_programs` with `training_program_tasks` and resolves task titles via the remote task catalog.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listStaffOrgIds, listTaProgramIds, requireStaff } from "@/lib/supabase/roles";
import { buildMonthGrid, collectDueEvents } from "@/lib/training/calendar";
import { loadRemotePacks } from "@/lib/training/remote-packs";
import { buildTaskCatalog } from "@/lib/training/task-catalog";
import { trainingTaskTitle } from "@/lib/training/task-meta";

/** Returns the month grid and due-task events visible to the caller. */
export async function GET(req: NextRequest) {
  // Require Supabase configuration and an authenticated user.
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

  // Resolve staff role; TAs are limited to their assigned programs.
  const staff = await requireStaff(supabase);
  const isStaff = !staff.error;
  let programFilter: string[] | null = null;
  if (!isStaff) {
    const taIds = await listTaProgramIds(supabase, user.id);
    if (taIds.length === 0) {
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    programFilter = taIds;
  }

  // Resolve the requested year/month, falling back to the current month.
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year") ?? now.getFullYear()) || now.getFullYear();
  const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1) || now.getMonth() + 1;

  // Query non-draft programs, applying role-based scoping.
  let pQuery = supabase
    .from("training_programs")
    .select("id, name, start_date, end_date, status, organization_id")
    .neq("status", "draft");
  if (programFilter) {
    pQuery = pQuery.in("id", programFilter);
  } else if (isStaff && staff.role === "librarian") {
    const orgIds = await listStaffOrgIds(supabase, user.id, staff.role);
    if (orgIds !== "all" && orgIds.length > 0) {
      pQuery = pQuery.in("organization_id", orgIds);
    } else if (orgIds !== "all") {
      return Response.json({
        ok: true,
        data: { year, month, days: [], events: [], access: "staff", scope: "org" },
      });
    }
  }
  const { data: programs, error } = await pQuery;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Load due dates for all program tasks in scope.
  const programIds = (programs ?? []).map((p) => p.id as string);
  const { data: tasks } = programIds.length
    ? await supabase
        .from("training_program_tasks")
        .select("program_id, task_id, due_at")
        .in("program_id", programIds)
        .not("due_at", "is", null)
    : { data: [] as Array<Record<string, unknown>> };

  // Resolve the task catalog so events carry readable titles.
  const packs = await loadRemotePacks(supabase);
  const catalog = buildTaskCatalog(packs);

  const events = collectDueEvents({
    programs: (programs ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      start_date: p.start_date as string | null,
      end_date: p.end_date as string | null,
    })),
    tasks: (tasks ?? []).map((t) => ({
      program_id: t.program_id as string,
      task_id: t.task_id as string,
      due_at: t.due_at as string | null,
      title: trainingTaskTitle(t.task_id as string, catalog),
    })),
  });

  // Lay the due events out onto the requested month grid.
  const days = buildMonthGrid({ year, month, events });

  return Response.json({
    ok: true,
    data: {
      year,
      month,
      days,
      events,
      access: isStaff ? "staff" : "ta",
    },
  });
}

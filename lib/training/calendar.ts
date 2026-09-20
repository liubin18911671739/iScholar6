/**
 * Pure due-date / calendar helpers for training camps.
 *
 * Functionality:
 * - Builds month grids (`buildMonthGrid`) of `CalendarDay` buckets.
 * - Collects task due / program start / program end events via `collectDueEvents`.
 * - Normalizes ISO timestamps into `YYYY-MM-DD` keys with `toDateKey`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** A single dated event rendered on the training calendar. */
export type DueEvent = {
  id: string;
  programId: string;
  programName?: string;
  taskId: string;
  taskTitle?: string;
  dueAt: string;
  kind: "task_due" | "program_start" | "program_end";
};

/** One day cell in the month grid with its events. */
export type CalendarDay = {
  date: string; // YYYY-MM-DD
  events: DueEvent[];
};

/** Reduce an ISO timestamp to its `YYYY-MM-DD` date key. */
export function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Build one `CalendarDay` per date in the given month, with events attached. */
export function buildMonthGrid(params: {
  year: number;
  month: number; // 1-12
  events: DueEvent[];
}): CalendarDay[] {
  const first = new Date(Date.UTC(params.year, params.month - 1, 1));
  const lastDay = new Date(Date.UTC(params.year, params.month, 0)).getUTCDate();
  // Index events by day key for O(1) lookup while filling the grid.
  const byDay = new Map<string, DueEvent[]>();
  for (const event of params.events) {
    const key = toDateKey(event.dueAt);
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }
  const days: CalendarDay[] = [];
  for (let d = 1; d <= lastDay; d += 1) {
    const date = `${params.year}-${String(params.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({ date, events: byDay.get(date) ?? [] });
    void first;
  }
  return days;
}

/** Flatten program bounds and task due dates into a chronologically sorted event list. */
export function collectDueEvents(params: {
  programs: Array<{
    id: string;
    name: string;
    start_date?: string | null;
    end_date?: string | null;
  }>;
  tasks: Array<{
    program_id: string;
    task_id: string;
    due_at?: string | null;
    title?: string;
  }>;
}): DueEvent[] {
  const events: DueEvent[] = [];
  const nameById = new Map(params.programs.map((p) => [p.id, p.name]));
  for (const p of params.programs) {
    if (p.start_date) {
      events.push({
        id: `start-${p.id}`,
        programId: p.id,
        programName: p.name,
        taskId: "",
        dueAt: p.start_date,
        kind: "program_start",
      });
    }
    if (p.end_date) {
      events.push({
        id: `end-${p.id}`,
        programId: p.id,
        programName: p.name,
        taskId: "",
        dueAt: p.end_date,
        kind: "program_end",
      });
    }
  }
  for (const t of params.tasks) {
    if (!t.due_at) continue;
    events.push({
      id: `due-${t.program_id}-${t.task_id}`,
      programId: t.program_id,
      programName: nameById.get(t.program_id),
      taskId: t.task_id,
      taskTitle: t.title,
      dueAt: t.due_at,
      kind: "task_due",
    });
  }
  return events.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

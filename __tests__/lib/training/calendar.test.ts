import { describe, expect, it } from "vitest";
import { buildMonthGrid, collectDueEvents } from "@/lib/training/calendar";

describe("calendar", () => {
  it("collects program and task due events", () => {
    const events = collectDueEvents({
      programs: [
        {
          id: "p1",
          name: "Camp",
          start_date: "2026-03-01",
          end_date: "2026-06-30",
        },
      ],
      tasks: [
        {
          program_id: "p1",
          task_id: "research-question",
          due_at: "2026-03-15T12:00:00.000Z",
          title: "RQ",
        },
      ],
    });
    expect(events.some((e) => e.kind === "program_start")).toBe(true);
    expect(events.some((e) => e.kind === "task_due")).toBe(true);
  });

  it("builds month grid with events on days", () => {
    const days = buildMonthGrid({
      year: 2026,
      month: 3,
      events: [
        {
          id: "1",
          programId: "p1",
          taskId: "t1",
          dueAt: "2026-03-10",
          kind: "task_due",
        },
      ],
    });
    expect(days.length).toBe(31);
    const day10 = days.find((d) => d.date === "2026-03-10");
    expect(day10?.events).toHaveLength(1);
  });
});

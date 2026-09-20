/**
 * DueCalendarPanel (components/training/due-calendar.tsx)
 *
 * Functionality:
 * - Renders a month calendar of training task due dates and program start/end events.
 * - Fetches `/api/training/calendar` for the visible year/month and refetches on navigation.
 * - Shows each day's events as truncated badges, capping visible entries at three per cell.
 *
 * Notes:
 * - Uses `CalendarDay`/`DueEvent` types from `@/lib/training/calendar` and the `training.manage` i18n namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";
import type { CalendarDay, DueEvent } from "@/lib/training/calendar";

/** Month view of training due dates and program milestones. */
export function DueCalendarPanel() {
  const t = useTranslations("training.manage");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [error, setError] = useState("");

  // Fetch calendar days for the currently selected year and month.
  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/training/calendar?year=${year}&month=${month}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(String(json.error ?? "LOAD_FAILED"));
      }
      const json = await res.json();
      setDays(json.data?.days ?? []);
    } catch (e) {
      setDays([]);
      setError(e instanceof Error ? e.message : t("calendarLoadError"));
    }
  }, [year, month, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Move the visible month by the given delta, rolling the year over as needed.
  function shift(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  // Translate a due-event kind into its localized label.
  function kindLabel(kind: DueEvent["kind"]) {
    if (kind === "task_due") return t("calendar.taskDue");
    if (kind === "program_start") return t("calendar.start");
    return t("calendar.end");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">
          {t("calendarTitle")} · {year}-{String(month).padStart(2, "0")}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => shift(-1)}>
            ←
          </Button>
          <Button size="sm" variant="outline" onClick={() => shift(1)}>
            →
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            {t("actions.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <RemoteLoadError error={error || null} onRetry={() => void load()} />
        <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => (
            <div
              key={day.date}
              className="min-h-[72px] rounded border border-border/50 bg-background/30 p-1"
            >
              <div className="text-[10px] text-muted-foreground">{day.date.slice(8)}</div>
              <div className="mt-0.5 space-y-0.5">
                {day.events.slice(0, 3).map((ev) => (
                  <Badge
                    key={ev.id}
                    variant="secondary"
                    className="block max-w-full truncate text-[9px] font-normal"
                    title={`${kindLabel(ev.kind)} ${ev.programName ?? ""} ${ev.taskTitle ?? ev.taskId}`}
                  >
                    {kindLabel(ev.kind)}
                  </Badge>
                ))}
                {day.events.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{day.events.length - 3}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * User Manual (components/module/user-manual.tsx)
 *
 * Functionality:
 * - Renders a collapsible in-module help panel with numbered manual sections for the current agent.
 * - Uses localized section content for built-in agents and a generic hint for plugin agents.
 * - Can be rendered embedded (non-collapsible) or as a self-collapsing card.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, X, ChevronLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isBuiltInAgent, type AgentId } from "@/lib/ai/agents/registry";
import { getStage, primaryStageForAgent, STAGES } from "./stages";

/** A titled section of the localized user manual. */
interface ManualSection {
  title: string;
  body: string;
}

/** Collapsible help panel describing how to use the current module. */
export function UserManual({
  agentId,
  showCollapse = true,
}: {
  agentId: AgentId;
  showCollapse?: boolean;
}) {
  const t = useTranslations("module");
  const [open, setOpen] = useState(showCollapse);
  const stage = getStage(primaryStageForAgent(agentId)) ?? STAGES[0];

  // Built-in agents use localized sections; plugin agents get a single generic hint.
  const sections = isBuiltInAgent(agentId)
    ? ((t.raw(`manual.${agentId}`) as ManualSection[]) ?? [])
    : [
        {
          title: t("manualTitle"),
          body: "This is a custom plugin agent. Fill in the form fields, confirm AI consent, and run.",
        },
      ];

  if (!open && showCollapse) {
    return (
      <div className="cosmic-panel flex items-center justify-between rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className={cn("h-4 w-4", stage.accent.text)} />
          <span className="text-sm font-medium">{t("manualTitle")}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
          {t("expand")}
        </Button>
      </div>
    );
  }

  const collapseButton = showCollapse ? (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground"
      onClick={() => setOpen(false)}
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  ) : null;

  return (
    <aside className={cn("flex max-h-full flex-col", showCollapse && "cosmic-panel rounded-xl")}>
      <header
        className={cn(
          "flex items-center justify-between px-4 py-3",
          showCollapse && "border-b border-border/50"
        )}
      >
        <div className="flex items-center gap-2">
          <BookOpen className={cn("h-4 w-4", stage.accent.text)} />
          <h3 className="text-sm font-semibold">{t("manualTitle")}</h3>
        </div>
        {collapseButton}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {t(`manualIntro.${agentId}` as "manualIntro.topic")}
        </p>
        {sections.map((section, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  stage.accent.chip
                )}
              >
                {i + 1}
              </span>
              <h4 className="text-[12px] font-semibold text-foreground/90">
                {section.title}
              </h4>
            </div>
            <p className="pl-6 text-[11px] leading-relaxed text-muted-foreground">
              {section.body}
            </p>
          </div>
        ))}
      </div>

      <footer className={cn("px-4 py-3", showCollapse && "border-t border-border/50")}>
        <div className="flex items-center gap-2 text-[11px] text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{t("manualStatus")}</span>
        </div>
      </footer>
    </aside>
  );
}

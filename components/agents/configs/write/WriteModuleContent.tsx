/**
 * WriteModuleContent (components/agents/configs/write/WriteModuleContent.tsx)
 *
 * Functionality:
 * - Provides the three-column Write module shell: IMRaD section navigation + inputs, the editing workspace, and references/format/output panels.
 * - Loads project bibliography items via `useLocalBibItems` and shows the inserted citation count and first five references.
 * - Renders the passed-in `inputs`, `workspace`, and `outputs` slots supplied by the agent page template.
 *
 * Notes:
 * - Section selection is currently visual-only (`activeSection` is fixed to "introduction").
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocalBibItems } from "@/lib/local/hooks";
import { ScrollColumn } from "../shared/ScrollColumn";
import type { ModuleContentProps } from "../../agent-page-template";
import { BookOpen, Download } from "lucide-react";

/** Three-column Write module layout wiring inputs, editor workspace, and outputs. */
export function WriteModuleContent({ inputs, workspace, outputs, projectId }: ModuleContentProps) {
  const t = useTranslations("moduleInputs.write");
  const [activeSection] = useState("introduction");
  const { data: bibItems } = useLocalBibItems(projectId);
  const insertedCount = bibItems?.length ?? 0;

  // Static IMRaD section cards; only the first is marked in progress.
  const sections = [
    { key: "introduction", label: t("introduction"), icon: "📖", status: "inProgress" as const },
    { key: "methods", label: t("methods"), icon: "🔬", status: "pending" as const },
    { key: "results", label: t("results"), icon: "📊", status: "pending" as const },
    { key: "discussion", label: t("discussion"), icon: "💬", status: "pending" as const },
  ];

  return (
    <div className="h-full p-4 sm:px-6">
      <div className="grid h-full gap-4 lg:grid-cols-[340px_1fr_280px]">
        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold">IMRaD 结构</h3>
            <div className="grid grid-cols-2 gap-2">
              {sections.map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    /* section navigation */
                  }}
                  className={`cosmic-panel rounded-lg p-3 text-left transition-all duration-200 ${
                    activeSection === s.key
                      ? "border-emerald-400/50 ring-1 ring-emerald-400/30 shadow-[0_0_15px_-3px_rgba(52,211,153,0.3)]"
                      : "hover:border-border/80"
                  }`}
                >
                  <span className="text-lg">{s.icon}</span>
                  <p className="text-xs font-medium mt-1">{s.label}</p>
                  <Badge
                    variant="outline"
                    className={`text-[9px] mt-1 ${
                      s.status === "inProgress"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/30"
                        : "bg-slate-500/10 text-slate-300 border-slate-400/30"
                    }`}
                  >
                    {s.status === "inProgress" ? t("statusInProgress") : t("statusPending")}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="border-t border-border pt-3">{inputs}</div>
          </div>
        </ScrollColumn>

        <ScrollColumn>
          {workspace}
        </ScrollColumn>

        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t("myReferences")}
            </h3>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-400/30">
              {t("insertedCitationsCount", { count: insertedCount })}
            </Badge>
            <div className="space-y-1.5">
              {bibItems?.slice(0, 5).map((item) => (
                <div key={item.id} className="text-[10px] text-muted-foreground border-b border-border/50 pb-1">
                  <p className="font-medium text-foreground truncate">{item.title}</p>
                  <p>{item.authors?.slice(0, 2).join(", ")}{(item.authors?.length ?? 0) > 2 ? " et al." : ""} ({item.year})</p>
                </div>
              ))}
              {(!bibItems || bibItems.length === 0) && (
                <p className="text-[10px] text-muted-foreground">暂无文献，运行文献综述后自动填充</p>
              )}
            </div>
          </div>

          <div className="cosmic-panel rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("formatLabel")}</h3>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs" defaultValue="APA">
              <option>APA 7th</option>
              <option>MLA 9th</option>
              <option>IEEE</option>
              <option>Chicago</option>
            </select>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                {t("downloadPDF")}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                {t("downloadWord")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">{outputs}</div>
        </ScrollColumn>
      </div>
    </div>
  );
}

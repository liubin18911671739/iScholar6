/**
 * Tools Hub (/tools)
 *
 * Functionality:
 * - Lists the three standalone tools (literature analysis, paper polishing, journal selection).
 * - Renders each tool as a link card with an icon, translated title, and description.
 * - Navigates to the /tools/[tool] workspace on click.
 *
 * Notes:
 * - Tool metadata lives in the TOOLS constant; labels resolve from the "tools" i18n namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { BookOpen, FileText, Send, ArrowRight } from "lucide-react";

/** Standalone tool entries: route slug, icon, and i18n label namespace. */
const TOOLS = [
  {
    slug: "literature-analysis",
    icon: BookOpen,
    namespace: "literatureAnalysis",
  },
  {
    slug: "paper-polishing",
    icon: FileText,
    namespace: "paperPolishing",
  },
  {
    slug: "journal-selection",
    icon: Send,
    namespace: "journalSelection",
  },
] as const;

/** Tools hub grid linking to each standalone tool workspace. */
export default function ToolsPage() {
  const t = useTranslations("tools");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="cosmic-panel group flex flex-col gap-4 rounded-xl p-6 transition-all hover:shadow-lg hover:scale-[1.02]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1.5">
                <h3 className="text-sm font-semibold">{t(`${tool.namespace}`)}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(`${tool.namespace}Desc`)}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                {t("launch")}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

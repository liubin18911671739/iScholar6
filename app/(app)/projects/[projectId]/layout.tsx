/**
 * Project Layout (app/(app)/projects/[projectId])
 *
 * Functionality:
 * - Wraps every project agent route with a back link and horizontal sub-navigation tabs.
 * - Highlights the active tab by comparing the current pathname to each tab href.
 * - Derives projectId from the route params and renders the nested page content.
 *
 * Notes:
 * - Tab metadata lives in the AGENT_TABS constant; labels are i18n keys.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Search,
  BookOpen,
  FlaskConical,
  Database,
  FileText,
  Send,
  MessageSquare,
  ArrowLeft,
} from "lucide-react";

/** Ordered agent sub-navigation tabs (href, i18n label key, and icon). */
const AGENT_TABS = [
  { href: "topic", labelKey: "nav.topic", icon: Search },
  { href: "litreview", labelKey: "nav.litreview", icon: BookOpen },
  { href: "design", labelKey: "nav.design", icon: FlaskConical },
  { href: "data", labelKey: "nav.data", icon: Database },
  { href: "write", labelKey: "nav.write", icon: FileText },
  { href: "submit", labelKey: "nav.submit", icon: Send },
  { href: "rebuttal", labelKey: "nav.rebuttal", icon: MessageSquare },
];

/** Shared project chrome: back link, agent tabs, and the nested route content. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { projectId } = useParams();
  const t = useTranslations();

  return (
    <div className="space-y-4">
      {/* Project sub-navigation */}
      <div className="flex items-center gap-4">
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {AGENT_TABS.map((tab) => {
            const href = `/projects/${projectId}/${tab.href}`;
            const isActive = pathname === href;
            return (
              <Link
                key={tab.href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}

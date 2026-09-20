/**
 * Sidebar (components/layouts/sidebar.tsx)
 *
 * Functionality:
 * - Renders the application sidebar navigation shared by desktop and mobile layouts.
 * - Loads non-archived projects from Supabase and offers a dropdown project selector.
 * - Resolves agent links dynamically from the active project in the URL (or the most recent project).
 *
 * Notes:
 * - Depends on the Supabase browser client and `fromRemoteRecord` field mapping; `Sidebar` is desktop-only.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fromRemoteRecord } from "@/lib/supabase/field-map";
import type { LocalProject } from "@/lib/local/db";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Search,
  BookOpen,
  FlaskConical,
  Database,
  FileText,
  Send,
  MessageSquare,
  Settings,
  Rocket,
  GraduationCap,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

// ── Nav Item Definitions ───────────────────────────────────────────────

// Marker entry that groups nav links under an optional section label.
interface NavSeparator {
  type: "separator";
  labelKey?: string;
}

// Navigable sidebar entry whose href is static or derived from the active project.
interface NavLink {
  type: "link";
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  agentSlug?: string; // If present, href is dynamic based on active project
  staticHref?: string; // If present, href is always this value
}

/** Discriminated union of the supported sidebar navigation entries. */
type NavItem = NavSeparator | NavLink;

// Ordered navigation model mixing project-scoped agent links with static tool/page links.
const NAV_ITEMS: NavItem[] = [
  { type: "link", labelKey: "nav.dashboard", icon: LayoutDashboard, staticHref: "/dashboard" },
  { type: "link", labelKey: "nav.projects", icon: FolderKanban, staticHref: "/projects" },
  { type: "link", labelKey: "nav.training", icon: GraduationCap, staticHref: "/training" },
  { type: "separator", labelKey: "nav.agents" },
  { type: "link", labelKey: "nav.topic", icon: Search, agentSlug: "topic" },
  { type: "link", labelKey: "nav.litreview", icon: BookOpen, agentSlug: "litreview" },
  { type: "link", labelKey: "nav.design", icon: FlaskConical, agentSlug: "design" },
  { type: "link", labelKey: "nav.data", icon: Database, agentSlug: "data" },
  { type: "link", labelKey: "nav.write", icon: FileText, agentSlug: "write" },
  { type: "link", labelKey: "nav.submit", icon: Send, agentSlug: "submit" },
  { type: "link", labelKey: "nav.rebuttal", icon: MessageSquare, agentSlug: "rebuttal" },
  { type: "separator", labelKey: "nav.tools" },
  { type: "link", labelKey: "nav.literatureAnalysis", icon: BookOpen, staticHref: "/tools/literature-analysis" },
  { type: "link", labelKey: "nav.paperPolishing", icon: FileText, staticHref: "/tools/paper-polishing" },
  { type: "link", labelKey: "nav.journalSelection", icon: Send, staticHref: "/tools/journal-selection" },
  { type: "separator" },
  { type: "link", labelKey: "nav.settings", icon: Settings, staticHref: "/settings" },
];

// ── Shared Navigation Content ─────────────────────────────────────────

/** Props for the shared sidebar navigation content. */
interface SidebarNavProps {
  onNavigate?: () => void;
}

/** Shared sidebar navigation content; invokes `onNavigate` after any link/project click. */
export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  // Resolve active project from URL or fallback to most recent
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  const urlProjectId = projectMatch?.[1];

  const [projects, setProjects] = useState<LocalProject[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setProjects(data.map((row) => fromRemoteRecord(row as Record<string, unknown>) as unknown as LocalProject));
        }
      });
  }, []);

  const activeProjectId =
    urlProjectId ?? projects.find((p) => p.status !== "archived")?.id;

  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Build href for a nav item
  function getHref(item: NavLink): string {
    if (item.staticHref) return item.staticHref;
    if (item.agentSlug) {
      return activeProjectId
        ? `/projects/${activeProjectId}/${item.agentSlug}`
        : "/projects";
    }
    return "#";
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Rocket className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">iScholar</span>
      </div>

      {/* Project Selector */}
      {projects.filter((p) => p.status !== "archived").length > 0 && (
        <div className="border-b border-border px-3 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-xs h-8 px-2"
              >
                <span className="truncate">
                  {activeProject?.name ?? t("nav.selectProject")}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="start"
              className="w-48"
            >
              {projects
                .filter((p) => p.status !== "archived")
                .map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => {
                      router.push(`/projects/${project.id}/topic`);
                      onNavigate?.();
                    }}
                    className={cn(
                      "text-xs",
                      project.id === activeProjectId && "font-semibold"
                    )}
                  >
                    {project.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {NAV_ITEMS.map((item, i) => {
          if (item.type === "separator") {
            return (
              <div key={i} className="pt-3 pb-1">
                {item.labelKey && (
                  <span className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t(item.labelKey)}
                  </span>
                )}
              </div>
            );
          }

          const Icon = item.icon;
          const href = getHref(item);
          const isActive =
            href !== "/projects" &&
            (pathname === href || pathname.startsWith(href + "/"));

          return (
            <Link
              key={`${item.labelKey}-${i}`}
              href={href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ── Desktop Sidebar Wrapper ────────────────────────────────────────────

/** Desktop-only sidebar wrapper that renders the shared navigation. */
export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-56 md:flex-col border-r border-border bg-card">
      <SidebarNav />
    </aside>
  );
}

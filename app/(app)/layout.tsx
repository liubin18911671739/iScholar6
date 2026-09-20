/**
 * App Layout (app/(app))
 *
 * Functionality:
 * - Client-side auth gate for every authenticated route using the Supabase browser client.
 * - Redirects unauthenticated users to /login and re-checks on auth state changes.
 * - Renders module/tool routes full-bleed; otherwise renders the sidebar, mobile drawer, and top bar.
 * - Shows a loading spinner until the initial session check resolves.
 *
 * Notes:
 * - Uses isBuiltInAgent/isPluginAgentId to detect full-bleed module routes.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isBuiltInAgent } from "@/lib/ai/agents/registry";
import { isPluginAgentId } from "@/lib/plugins/ids";
import { Sidebar, SidebarNav } from "@/components/layouts/sidebar";
import { TopBar } from "@/components/layouts/top-bar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** Module agent pages and tool pages render full-bleed (no global sidebar / topbar). */
function isModuleRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const segments = pathname.split("/").filter(Boolean);
  // Tool routes: /tools/[tool]
  if (segments.length === 2 && segments[0] === "tools") return true;
  // Agent routes: /projects/[id]/[agent] (built-in or plugin p.<id>.<key>)
  if (segments.length === 3 && segments[0] === "projects") {
    const agentSeg = decodeURIComponent(segments[2]);
    return isBuiltInAgent(agentSeg) || isPluginAgentId(agentSeg);
  }
  return false;
}

/** Authenticated app shell: gates on auth then renders sidebar/topbar or a full-bleed module layout. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Verify the session once and keep redirecting to /login while signed out.
  useEffect(() => {
    fetch("/api/auth/session").then((response) => response.json()).then((session) => {
      if (!session?.user) {
        router.replace("/login");
      } else {
        setReady(true);
      }
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isModuleRoute(pathname)) {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Mobile sidebar (Sheet) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-56 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>导航</SheetTitle>
            </SheetHeader>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar onMenuToggle={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
  );
}

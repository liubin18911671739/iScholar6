/**
 * App Loading Skeleton (/(app))
 *
 * Functionality:
 * - Suspense fallback for the authenticated app route group.
 * - Renders placeholder sidebar, topbar, and content skeletons while loading.
 *
 * Notes:
 * - Built from the shared Skeleton primitive.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { Skeleton } from "@/components/ui/skeleton";

/** Full-shell loading skeleton shown while app segments stream in. */
export default function AppLoading() {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar skeleton */}
      <aside className="hidden w-56 shrink-0 border-r border-border p-4 space-y-4 lg:block">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-md" />
        ))}
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar skeleton */}
        <Skeleton className="h-14 mx-6 mt-4 rounded-lg" />
        {/* Content skeleton */}
        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </main>
      </div>
    </div>
  );
}

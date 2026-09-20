/**
 * Dashboard Loading Skeleton (/(app)/dashboard)
 *
 * Functionality:
 * - Suspense fallback for the dashboard route.
 * - Mimics the stat-card grid and chart panels while dashboard data loads.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton that mirrors the dashboard stats and chart layout. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="cosmic-panel rounded-xl p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

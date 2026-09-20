/**
 * Projects Loading Skeleton (/(app)/projects)
 *
 * Functionality:
 * - Suspense fallback for the projects list route.
 * - Renders a placeholder grid of project cards while projects load.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton for the projects list grid. */
export default function ProjectsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="cosmic-panel rounded-xl p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

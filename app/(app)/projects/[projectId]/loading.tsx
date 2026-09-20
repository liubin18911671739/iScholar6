/**
 * Project Detail Loading Skeleton (/(app)/projects/[projectId])
 *
 * Functionality:
 * - Suspense fallback for a single project's detail route.
 * - Renders placeholder panel cards while the project data loads.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton for a single project detail view. */
export default function ProjectLoading() {
  return (
    <div className="space-y-4 w-full">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="cosmic-panel rounded-xl p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

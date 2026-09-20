/**
 * Training Report (/training/report)
 *
 * Functionality:
 * - Loads locally stored projects and renders the TrainingReport for the first project.
 * - Normalizes the hook payload to an array and guards against undefined/null data.
 * - Surfaces IndexedDB/remote load failures through RemoteLoadError with a retry action.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { TrainingReport } from "@/components/training/report";
import { useLocalProjects } from "@/lib/local/hooks";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";

/** Route entry that loads local projects and renders the training report. */
export default function TrainingReportPage() {
  // Load projects from local storage and expose any load error for fallback rendering.
  const { data: projectsData, error, refetch } = useLocalProjects();
  // Normalize the hook payload to an array to guard against undefined or null data.
  const projects = Array.isArray(projectsData) ? projectsData : [];
  // Render the load error with a retry action instead of the report when fetching fails.
  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <RemoteLoadError error={error} onRetry={refetch} />
      </div>
    );
  }
  // Report on the first project, falling back to an empty id when none exist.
  return <TrainingReport projectId={projects[0]?.id ?? ""} />;
}

/**
 * EmptyState (components/agents/outputs/shared/empty-state.tsx)
 *
 * Functionality:
 * - Small presentational placeholder shown when an agent output panel has no run data.
 * - Displays a file icon plus the provided title and description text.
 * - Used across the agents output panels as their "no results" state.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { FileText } from "lucide-react";

/** Props for `EmptyState`: heading and supporting description copy. */
interface EmptyStateProps {
  title: string;
  description: string;
}

/** Centered icon + copy placeholder for empty agent outputs. */
export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <FileText className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs mt-1">{description}</p>
    </div>
  );
}

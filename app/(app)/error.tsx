/**
 * App Error Boundary (/(app))
 *
 * Functionality:
 * - Client error boundary scoped to the authenticated app route group.
 * - Shows the error message and offers a reset action to retry rendering.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { Button } from "@/components/ui/button";

/** App-group error boundary rendered inside the shared app shell. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="cosmic-panel rounded-xl p-8 max-w-md text-center space-y-4">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred in the app"}
        </p>
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      </div>
    </div>
  );
}

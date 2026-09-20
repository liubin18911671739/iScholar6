/**
 * Root Error Boundary (/)
 *
 * Functionality:
 * - Client error boundary for the root app segment.
 * - Renders the error message plus digest ID and a reset button.
 * - Emits its own <html>/<body> because the root layout may have failed.
 *
 * Notes:
 * - Uses the shared Button primitive from @/components/ui/button.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { Button } from "@/components/ui/button";

/** Root error boundary that lets users retry rendering the failed tree. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-background text-foreground font-sans antialiased">
        <div className="flex items-center justify-center h-screen">
          <div className="cosmic-panel rounded-xl p-8 max-w-md text-center space-y-4">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              {error.message || "An unexpected error occurred"}
            </p>
            {error.digest && (
              <p className="text-[10px] text-muted-foreground font-mono">
                ID: {error.digest}
              </p>
            )}
            <Button onClick={reset} variant="outline">
              Try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}

/**
 * RemoteLoadError (components/collaborative/remote-load-error.tsx)
 *
 * Functionality:
 * - Renders an explicit alert banner for failed collaborative Supabase reads instead of an empty list.
 * - Accepts an optional retry callback and a `compact` layout for dense panels.
 * - Also exports `firstRemoteError`, which returns the first non-empty error string from several.
 *
 * Notes:
 * - Styling composes Tailwind classes via `cn` and the shadcn Button.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Props for `RemoteLoadError`: error text, optional retry, and layout options. */
interface RemoteLoadErrorProps {
  error: string | null | undefined;
  onRetry?: () => void;
  className?: string;
  /** Optional compact layout for dense panels */
  compact?: boolean;
}

/**
 * Explicit failure UI for collaborative Supabase reads.
 * Prefer this over silently rendering an empty list.
 */
export function RemoteLoadError({ error, onRetry, className, compact }: RemoteLoadErrorProps) {
  if (!error) return null;

  return (
    <div
      role="alert"
      className={cn(
        "rounded border border-destructive/40 bg-destructive/10 text-destructive",
        compact ? "p-2 text-xs" : "p-3 text-sm",
        className
      )}
    >
      <div className={cn("flex gap-2", onRetry ? "items-start justify-between" : "items-start")}>
        <div className="flex min-w-0 items-start gap-2">
          <AlertCircle className={cn("shrink-0", compact ? "mt-0.5 h-3.5 w-3.5" : "mt-0.5 h-4 w-4")} />
          <p className="min-w-0 leading-relaxed">{error}</p>
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={onRetry}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            重试
          </Button>
        )}
      </div>
    </div>
  );
}

/** Merge several independent remote errors into one banner message. */
export function firstRemoteError(...errors: Array<string | null | undefined>): string | null {
  for (const error of errors) {
    if (error) return error;
  }
  return null;
}

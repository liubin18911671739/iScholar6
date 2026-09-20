/**
 * Skeleton UI primitive (components/ui/skeleton.tsx)
 *
 * Functionality:
 * - Renders a simple div placeholder with pulse animation for loading states.
 * - Merge caller className via cn onto the base muted rounded styles.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { cn } from "@/lib/utils"

/** Animated placeholder block for loading content. */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }

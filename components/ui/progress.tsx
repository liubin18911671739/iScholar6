/**
 * Progress UI primitive (components/ui/progress.tsx)
 *
 * Functionality:
 * - Wraps the Radix Progress root and indicator as a shadcn progress bar.
 * - Forwards a ref and merges caller className via cn.
 * - Translates the indicator by value percentage for the fill animation.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

/** Styled Radix progress bar with percentage-driven indicator. */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }

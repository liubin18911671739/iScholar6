/**
 * Separator UI primitive (components/ui/separator.tsx)
 *
 * Functionality:
 * - Wraps the Radix Separator root as a shadcn divider.
 * - Forwards a ref and merges caller className via cn.
 * - Defaults to a decorative horizontal divider with orientation-aware sizing.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/lib/utils"

/** Styled horizontal or vertical Radix separator. */
const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  )
)
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }

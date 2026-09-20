/**
 * Tooltip UI primitive (components/ui/tooltip.tsx)
 *
 * Functionality:
 * - Re-exports the Radix Tooltip provider, root, and trigger.
 * - Wraps TooltipContent with a forwarded ref and default sideOffset.
 * - Merges caller className via cn onto the styled popover-like content.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

/** Provides shared tooltip delay/state context. */
const TooltipProvider = TooltipPrimitive.Provider

/** Root tooltip state container. */
const Tooltip = TooltipPrimitive.Root

/** Element that triggers the tooltip. */
const TooltipTrigger = TooltipPrimitive.Trigger

/** Styled Radix tooltip content bubble. */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

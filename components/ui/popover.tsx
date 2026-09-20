/**
 * Popover UI primitive (components/ui/popover.tsx)
 *
 * Functionality:
 * - Re-exports the Radix Popover root and trigger as thin shadcn wrappers.
 * - Forwards a ref through PopoverContent and portals it with default align/sideOffset.
 * - Applies Tailwind popover styling merged through cn with caller className.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

/** Root popover state container. */
const Popover = PopoverPrimitive.Root

/** Element that opens the popover. */
const PopoverTrigger = PopoverPrimitive.Trigger

/** Styled portal-rendered Radix popover content. */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }

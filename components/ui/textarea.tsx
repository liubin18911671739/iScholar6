/**
 * Textarea UI primitive (components/ui/textarea.tsx)
 *
 * Functionality:
 * - Wraps a native textarea in a styled shadcn text input control.
 * - Forwards a ref and merges caller className via cn.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import * as React from "react"

import { cn } from "@/lib/utils"

/** Props for the styled textarea. */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/** Styled multi-line text input. */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }

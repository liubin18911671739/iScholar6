/**
 * Input UI primitive (components/ui/input.tsx)
 *
 * Functionality:
 * - Renders a styled native input with forwarded ref and merged classes via cn().
 * - Exposes the InputProps type alias for consumers.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import * as React from "react"

import { cn } from "@/lib/utils"

/** Props for the Input component. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/** Styled text input. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

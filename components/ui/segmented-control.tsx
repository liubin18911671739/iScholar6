/**
 * Segmented Control UI primitive (components/ui/segmented-control.tsx)
 *
 * Functionality:
 * - Renders a custom radiogroup of buttons with a single active segment.
 * - Reports selection changes through the onChange callback and styles active state.
 * - Merge caller className via cn onto the group container.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { cn } from "@/lib/utils";

/** Props for the segmented control. */
interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Accessible segmented button group for single selection. */
export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border bg-muted/50 p-0.5",
        className
      )}
      role="radiogroup"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

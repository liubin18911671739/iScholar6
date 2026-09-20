/**
 * Tag Input UI primitive (components/ui/tag-input.tsx)
 *
 * Functionality:
 * - Renders toggleable tag buttons for a list of options with multi-select.
 * - Reports the updated selection through onChange on each toggle.
 * - Merge caller className and accentClass via cn for container and active tags.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/** Props for the tag input. */
interface TagInputProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  accentClass?: string;
}

/** Multi-select tag button group. */
export function TagInput({
  options,
  selected,
  onChange,
  className,
  accentClass,
}: TagInputProps) {
  function toggle(tag: string) {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="group" aria-label="Tag selection">
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200",
              isSelected
                ? cn(
                    "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25",
                    accentClass
                  )
                : "border-border bg-muted/40 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
            )}
          >
            {option}
            {isSelected && <X className="h-3 w-3 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sub Feature Tabs (components/module/sub-feature-tabs.tsx)
 *
 * Functionality:
 * - Renders a compact segmented control for switching between module sub-features (Phase 3B).
 * - Hides itself when there is at most one option, and reports selection through the `onChange` callback.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { cn } from "@/lib/utils";

/** A single selectable sub-feature tab. */
interface SubFeatureOption {
  value: string;
  label: string;
}

/** Props for the sub-feature segmented control. */
interface SubFeatureTabsProps {
  options: SubFeatureOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Segmented control for selecting among module sub-features. */
export function SubFeatureTabs({ options, value, onChange }: SubFeatureTabsProps) {
  if (options.length <= 1) return null;

  return (
    <div className="flex items-center rounded-lg bg-muted/40 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-all",
            value === opt.value
              ? "cosmic-panel text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

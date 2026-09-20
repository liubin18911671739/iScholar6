/**
 * InteractiveBadge UI primitive (components/ui/interactive-badge.tsx)
 *
 * Functionality:
 * - Renders a Badge with a fixed palette of variant styles and an optional active ring.
 * - When onClick is provided it becomes keyboard accessible via role, tabIndex and Enter/Space handling.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "emerald" | "rose" | "slate" | "red" | "yellow" | "blue";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  emerald:
    "bg-emerald-500/15 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/25 cursor-pointer",
  rose: "bg-rose-500/15 text-rose-300 border-rose-400/30 hover:bg-rose-500/25 cursor-pointer",
  slate:
    "bg-slate-500/15 text-slate-300 border-slate-400/30 hover:bg-slate-500/25 cursor-pointer",
  red: "bg-red-500/15 text-red-300 border-red-400/30 hover:bg-red-500/25 cursor-pointer",
  yellow:
    "bg-yellow-500/15 text-yellow-300 border-yellow-400/30 hover:bg-yellow-500/25 cursor-pointer",
  blue: "bg-blue-500/15 text-blue-300 border-blue-400/30 hover:bg-blue-500/25 cursor-pointer",
};

/** Props for InteractiveBadge, including label, variant and click handler. */
interface InteractiveBadgeProps {
  label: string;
  active?: boolean;
  variant: BadgeVariant;
  onClick?: () => void;
  className?: string;
}

/** Clickable badge with palette variants and optional active state. */
export function InteractiveBadge({
  label,
  active = false,
  variant,
  onClick,
  className,
}: InteractiveBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] transition-all duration-200 select-none",
        active && "ring-1 ring-offset-1 ring-offset-background",
        VARIANT_STYLES[variant],
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {label}
    </Badge>
  );
}

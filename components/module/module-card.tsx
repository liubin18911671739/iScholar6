/**
 * Module Card (components/module/module-card.tsx)
 *
 * Functionality:
 * - Provides a reusable cosmic-panel card shell with an optional header (icon/title/subtitle) and right-aligned slot.
 * - Renders arbitrary children in the body and forwards `accent`/`className`/`bodyClassName` styling.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props for the reusable module card shell. */
interface ModuleCardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Accent text class, e.g. "text-cyan-300" — applied to the icon + title accent dot */
  accent?: string;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Reusable card container with optional header slots and body content. */
export function ModuleCard({
  title,
  subtitle,
  icon,
  accent = "text-blue-300",
  right,
  className,
  bodyClassName,
  children,
}: ModuleCardProps) {
  return (
    <section
      className={cn(
        "cosmic-panel flex flex-col rounded-xl shadow-lg shadow-black/20",
        className
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className={cn("shrink-0", accent)}>{icon}</span>}
            {title && (
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{title}</h3>
                {subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </div>
          {right}
        </header>
      )}
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Shared column wrapper for independent scrolling in module layouts.
 *
 * Functionality:
 * - Renders a fixed-height overflow container with hidden scrollbars and vertical spacing.
 * - Accepts arbitrary children plus an optional className appended to the base classes.
 *
 * @author mrpi
 * @date 2026-09-16
 */

export function ScrollColumn({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`h-[calc(100vh-12rem)] overflow-y-auto no-scrollbar space-y-4 ${className}`}
    >
      {children}
    </div>
  );
}

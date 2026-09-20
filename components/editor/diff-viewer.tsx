/**
 * DiffViewer (components/editor/diff-viewer.tsx)
 *
 * Functionality:
 * - Renders a line-level text diff between `oldText` and `newText`.
 * - Highlights added lines in green and removed lines in red with strikethrough.
 * - Memoizes the diff computation on both inputs to avoid recomputation.
 *
 * Notes:
 * - Uses the `diff` package (`diffLines`) and accepts a `className` for layout overrides.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useMemo } from "react";
import * as Diff from "diff";

/** Props for `DiffViewer`: source/target text and an optional class name. */
interface DiffViewerProps {
  oldText: string;
  newText: string;
  className?: string;
}

/** Inline colored text diff between two strings. */
export function DiffViewer({ oldText, newText, className = "" }: DiffViewerProps) {
  const changes = useMemo(
    () => Diff.diffLines(oldText || "", newText || ""),
    [oldText, newText]
  );

  return (
    <div className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-words ${className}`}>
      {changes.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="bg-green-500/20 text-green-400">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={i} className="bg-red-500/20 text-red-400 line-through">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
}

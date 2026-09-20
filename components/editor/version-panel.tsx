/**
 * VersionPanel (components/editor/version-panel.tsx)
 *
 * Functionality:
 * - Lists a block's version history from `useBlockVersions`, distinguishing AI vs. user edits.
 * - Expands a version to show a diff against the current content and to restore it.
 * - Restores a version through `rollbackToVersion` with toast feedback, showing loading/error/empty states.
 *
 * Notes:
 * - Uses `DiffViewer`, date-fns formatting, sonner toasts, and the shadcn ScrollArea/Badge/Button.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { useBlockVersions, rollbackToVersion } from "@/lib/local/hooks";
import { DiffViewer } from "./diff-viewer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, RotateCcw, ChevronDown, ChevronUp, Bot, User } from "lucide-react";
import { toast } from "sonner";

/** Props for `VersionPanel`: the block id and its current content. */
interface VersionPanelProps {
  blockId: string;
  currentContent: string;
}

/** Expandable version history with diff and restore. */
export function VersionPanel({ blockId, currentContent }: VersionPanelProps) {
  const t = useTranslations("versionHistory");
  const { data: versions, error } = useBlockVersions(blockId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History className="h-8 w-8 text-destructive mb-2" />
        <p role="alert" className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!versions || versions.length <= 1) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
      </div>
    );
  }

  // Rolls the block back to the selected version with toast feedback.
  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      await rollbackToVersion(versionId);
      toast.success(t("restoreSuccess"));
    } catch {
      toast.error(t("restoreError"));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 p-1">
        {versions.map((version) => {
          const isExpanded = expandedId === version.id;
          const isLatest = version === versions[0];

          return (
            <div
              key={version.id}
              className="rounded-lg border border-border bg-card"
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50 rounded-lg transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : version.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      v{version.version}
                    </Badge>
                    {version.authorType === "ai" ? (
                      <Bot className="h-3 w-3 text-blue-400" />
                    ) : (
                      <User className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(version.createdAt), "MM-dd HH:mm")}
                    </span>
                    {isLatest && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {t("latest")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {version.content.slice(0, 80)}
                    {version.content.length > 80 ? "..." : ""}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-border px-3 py-3 space-y-3">
                  <DiffViewer
                    oldText={currentContent}
                    newText={version.content}
                    className="max-h-[150px] overflow-y-auto rounded border border-border p-2"
                  />
                  {!isLatest && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={restoring === version.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(version.id);
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-3 w-3" />
                      {restoring === version.id ? t("restoring") : t("restore")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

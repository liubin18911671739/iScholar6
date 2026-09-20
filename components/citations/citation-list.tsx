/**
 * CitationList (components/citations/citation-list.tsx)
 *
 * Functionality:
 * - Lists project bibliography items from `useLocalBibItems` with a text filter over titles and authors.
 * - Emits the selected item through `onSelectCitation` and supports deleting an item via `deleteBibItem`.
 * - Handles loading, remote-load error (with retry), empty, and no-match states.
 *
 * Notes:
 * - Uses `RemoteLoadError` for failed collaborative reads; shows a total count footer.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocalBibItems, deleteBibItem } from "@/lib/local/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Trash2, Quote } from "lucide-react";
import type { LocalBibItem } from "@/lib/local/db";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";

/** Props for `CitationList`: project scope and optional selection handler. */
interface CitationListProps {
  projectId: string;
  onSelectCitation?: (bibItem: LocalBibItem) => void;
}

/** Filterable list of local bibliography entries. */
export function CitationList({ projectId, onSelectCitation }: CitationListProps) {
  const t = useTranslations("citations");
  const { data: bibItems, error, refetch } = useLocalBibItems(projectId);
  const [filter, setFilter] = useState("");

  if (error) {
    return <RemoteLoadError error={error} onRetry={refetch} compact />;
  }

  if (!bibItems) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        {t("loading")}
      </div>
    );
  }

  const filtered = filter
    ? bibItems.filter(
        (item) =>
          item.title.toLowerCase().includes(filter.toLowerCase()) ||
          item.authors?.some((a) => a.toLowerCase().includes(filter.toLowerCase()))
      )
    : bibItems;

  if (bibItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <BookOpen className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">{t("noMatch")}</p>
        <p className="text-xs">{t("searchHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("filter")}
        className="h-8 text-sm"
      />
      <ScrollArea className="max-h-[300px]">
        <div className="space-y-1.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-2 rounded-md border p-2 hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => onSelectCitation?.(item)}
            >
              <Quote className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs font-medium leading-tight line-clamp-2">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {item.year && <span>{item.year}</span>}
                  {item.venue && (
                    <>
                      <span>·</span>
                      <span className="truncate">{item.venue}</span>
                    </>
                  )}
                  {item.citationCount != null && (
                    <Badge variant="secondary" className="h-4 text-[10px] px-1">
                      {item.citationCount} cit.
                    </Badge>
                  )}
                </div>
                {item.authors && item.authors.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {item.authors.slice(0, 3).join(", ")}
                    {item.authors.length > 3 && " et al."}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBibItem(item.id);
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t("noMatch")}
            </p>
          )}
        </div>
      </ScrollArea>
      <p className="text-[10px] text-muted-foreground text-center">
        {t("totalCount", { count: bibItems.length })}
      </p>
    </div>
  );
}

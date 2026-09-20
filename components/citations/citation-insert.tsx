/**
 * CitationInsert (components/citations/citation-insert.tsx)
 *
 * Functionality:
 * - Popover affordance that inserts a citation key into the editor via the `onInsertCitation` callback.
 * - Supports quick custom-key entry (Enter or button) and selecting from the project bibliography.
 * - Derives a citation key from the first author plus year when a library item is selected.
 *
 * Notes:
 * - Embeds `CitationList`; closes the popover after any insertion.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { CitationList } from "./citation-list";
import { Quote } from "lucide-react";

/** Props for `CitationInsert`: project scope and the insert callback. */
interface CitationInsertProps {
  projectId: string;
  onInsertCitation: (key: string) => void;
}

/** Popover for inserting or picking a citation key. */
export function CitationInsert({ projectId, onInsertCitation }: CitationInsertProps) {
  const t = useTranslations("citations");
  const [open, setOpen] = useState(false);
  const [customKey, setCustomKey] = useState("");

  // Inserts the chosen key and dismisses the popover.
  function handleInsert(key: string) {
    onInsertCitation(key);
    setOpen(false);
  }

  // Inserts the user-typed key, trimming and clearing it.
  function handleCustomInsert() {
    if (customKey.trim()) {
      onInsertCitation(customKey.trim());
      setCustomKey("");
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
          <Quote className="h-3.5 w-3.5" />
          {t("cite")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium">{t("insertCitation")}</p>

          {/* Quick insert by key */}
          <div className="flex gap-1.5">
            <Input
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              placeholder="e.g., smith2024"
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === "Enter" && handleCustomInsert()}
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleCustomInsert}
              disabled={!customKey.trim()}
            >
              {t("insert")}
            </Button>
          </div>

          <div className="border-t pt-2">
            <p className="text-[10px] text-muted-foreground mb-1.5">
              {t("orSelect")}
            </p>
            <CitationList
              projectId={projectId}
              onSelectCitation={(item) => {
                // Build a citation key from first author + year
                const firstAuthor = item.authors?.[0]?.split(",").at(0)?.trim() ?? "unknown";
                const key = `${firstAuthor.toLowerCase().replace(/\s+/g, "")}${item.year ?? ""}`;
                handleInsert(key);
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

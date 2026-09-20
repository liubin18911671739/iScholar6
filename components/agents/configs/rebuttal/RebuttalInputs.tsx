/**
 * Rebuttal Inputs (components/agents/configs/rebuttal/RebuttalInputs.tsx)
 *
 * Functionality:
 * - Provides a reviewer-comment textarea plus a PDF upload that auto-extracts comments.
 * - Tracks PDF parsing/loading and error state and writes extracted text back to the field state.
 *
 * Notes:
 * - Uses processReviewPDF to parse uploaded review PDFs into numbered comments.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { processReviewPDF } from "@/lib/pdf/parse-review";
import type { InputProps } from "../../agent-page-template";
import { Upload, Loader2 } from "lucide-react";

/** Input form for the reviewer-rebuttal agent with PDF comment extraction. */
export function RebuttalInputs({ fieldState, setField }: InputProps) {
  const t = useTranslations("agentConfig");
  const tCommon = useTranslations("common");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parses the selected PDF; falls back to full text when no discrete comments are found.
  async function handlePDFUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setPdfError(tCommon("uploadPdf"));
      return;
    }
    setPdfLoading(true);
    setPdfError("");
    try {
      const { fullText, comments } = await processReviewPDF(file);
      if (comments.length > 0) {
        const formatted = comments.map((c) => `Comment ${c.commentNumber}:\n${c.comment}`).join("\n\n---\n\n");
        setField("reviewerComments", formatted);
      } else {
        setField("reviewerComments", fullText);
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Failed to parse PDF");
    } finally {
      setPdfLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("reviewerComment")}</Label>
        <Textarea
          value={fieldState.reviewerComments ?? ""}
          onChange={(e) => setField("reviewerComments", e.target.value)}
          placeholder={t("reviewerCommentPlaceholder")}
          className="min-h-[200px]"
        />
      </div>
      <div className="space-y-2">
        <Label>{t("uploadReviewPdf")}</Label>
        <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handlePDFUpload} className="hidden" />
        <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={pdfLoading}>
          {pdfLoading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{tCommon("parsingPdf")}</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" />{t("uploadReviewPdf")}</>
          )}
        </Button>
        {pdfError && <p className="text-xs text-destructive">{pdfError}</p>}
        <p className="text-[10px] text-muted-foreground">{t("uploadPdfAutoExtract")}</p>
      </div>
    </div>
  );
}

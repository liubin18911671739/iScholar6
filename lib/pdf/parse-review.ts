/**
 * Parse Review (lib/pdf/parse-review.ts)
 *
 * Functionality:
 * - Extracts plain text from uploaded PDF files using `pdfjs-dist` in the browser.
 * - Parses reviewer comments from raw text via numbered-section patterns with paragraph fallbacks.
 * - Bundles extraction and parsing into a single `processReviewPDF` helper.
 *
 * Notes:
 * - Client-only module; configures the pdf.js CDN worker when `window` exists.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import * as pdfjsLib from "pdfjs-dist";

// Configure worker for browser environment
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/** A single parsed reviewer comment with its ordinal number. */
export interface ParsedComment {
  commentNumber: number;
  comment: string;
}

/**
 * Extract text from a PDF file using pdfjs-dist.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n");
}

/**
 * Parse reviewer comments from extracted PDF text.
 * Attempts to split text into individual comments using common patterns.
 */
export function parseReviewerComments(text: string): ParsedComment[] {
  const comments: ParsedComment[] = [];

  // Split by common section headers
  const sectionPatterns = [
    /(?:comment\s*(\d+)|reviewer\s*comment\s*(\d+)|remarks?\s*(\d+)|point\s*(\d+))\s*[:\-–]/gi,
    /^(?:\s*(\d+)\s*[\.。\)]\s+)/gm,
  ];

  // Try to find numbered sections
  let matches: RegExpExecArray[] = [];
  for (const pattern of sectionPatterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      matches.push(match);
    }
    if (matches.length >= 2) break;
    matches = [];
  }

  if (matches.length >= 2) {
    // Extract text between matches
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const commentText = text.slice(start, end).trim();
      if (commentText) {
        const num = parseInt(matches[i][1] || matches[i][2] || matches[i][3] || matches[i][4] || String(i + 1));
        comments.push({
          commentNumber: num || i + 1,
          comment: commentText,
        });
      }
    }
  }

  // Fallback: If no numbered pattern found, split by paragraphs
  if (comments.length === 0) {
    const paragraphs = text
      .split(/\n\s*\n|\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20); // Skip very short lines

    // Try to identify comment paragraphs by looking for review-like language
    const reviewKeywords =
      /(?:suggest|recommend|should|could|improve|concern|issue|problem|missing|unclear|confusing|weakness|strength|major|minor|revise|rewrite|clarif|address)/i;

    let commentNum = 1;
    let currentComment = "";

    for (const para of paragraphs) {
      if (reviewKeywords.test(para)) {
        if (currentComment && currentComment.length > 30) {
          comments.push({
            commentNumber: commentNum++,
            comment: currentComment.trim(),
          });
        }
        currentComment = para;
      } else {
        currentComment += (currentComment ? " " : "") + para;
      }
    }

    // Push last comment
    if (currentComment.trim().length > 30) {
      comments.push({
        commentNumber: commentNum,
        comment: currentComment.trim(),
      });
    }
  }

  // Ultimate fallback: treat the whole text as one comment
  if (comments.length === 0 && text.trim().length > 10) {
    comments.push({
      commentNumber: 1,
      comment: text.trim(),
    });
  }

  return comments;
}

/**
 * Process a PDF file: extract text and parse into reviewer comments.
 * Returns both the full text and parsed comments.
 */
export async function processReviewPDF(
  file: File
): Promise<{ fullText: string; comments: ParsedComment[] }> {
  const fullText = await extractTextFromPDF(file);
  const comments = parseReviewerComments(fullText);
  return { fullText, comments };
}

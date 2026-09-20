/**
 * Submission Package Builder (lib/export/submission-package.ts)
 *
 * Functionality:
 * - Gathers manuscript blocks from Dexie or Supabase and renders submission documents.
 * - Builds Word-compatible HTML for the manuscript and cover letter plus a checklist.
 * - Zips the artifacts with JSZip and triggers a browser download.
 *
 * Notes:
 * - Client-only ("use client"); requires manuscript title/abstract for the cover letter.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import JSZip from "jszip";
import { localDB, type LocalManuscript, type LocalManuscriptBlock } from "@/lib/local/db";
import { getCollaborativeClient, isCollaborativeMode } from "@/lib/supabase/collaborative";
import { fromRemoteRecord } from "@/lib/supabase/field-map";

/**
 * Generate a formatted HTML document that Word can open as .doc
 */
function generateDocHTML(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(title)}</title>
  <style>
    body { font-family: "Times New Roman", Georgia, serif; font-size: 12pt; line-height: 1.6; margin: 2.54cm; }
    h1 { font-size: 16pt; text-align: center; margin-bottom: 24pt; }
    h2 { font-size: 14pt; margin-top: 18pt; margin-bottom: 12pt; }
    h3 { font-size: 12pt; font-weight: bold; margin-top: 12pt; }
    p { text-align: justify; margin-bottom: 6pt; }
    .abstract { margin: 12pt 40pt; font-style: italic; }
    .keywords { margin: 6pt 40pt 18pt; font-size: 10pt; }
    .references { font-size: 10pt; }
    .references p { padding-left: 2em; text-indent: -2em; }
    table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
    td, th { border: 1px solid #000; padding: 4pt 8pt; font-size: 10pt; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Escape HTML metacharacters in a string. */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert markdown-like text to basic HTML
 */
function markdownToSimpleHTML(md: string): string {
  let html = md;
  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Paragraphs
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<table")
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  return html;
}

/**
 * Generate a cover letter HTML document
 */
function generateCoverLetter(params: {
  journalName: string;
  paperTitle: string;
  abstract?: string;
}): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = `
<h2>Cover Letter</h2>
<p>${today}</p>
<p>Dear Editor,</p>
<p>
  We are pleased to submit our manuscript entitled
  "<strong>${escapeHTML(params.paperTitle)}</strong>"
  for consideration for publication in <em>${escapeHTML(params.journalName)}</em>.
</p>
<p>
  This manuscript presents original research that has not been published previously,
  and is not under consideration for publication elsewhere. All authors have read and
  approved the final manuscript.
</p>
${params.abstract ? `<p><strong>Abstract:</strong></p><p class="abstract">${escapeHTML(params.abstract)}</p>` : ""}
<p>
  We believe this work makes a significant contribution to the field and would be
  suitable for the readership of <em>${escapeHTML(params.journalName)}</em>.
  We look forward to your consideration.
</p>
<p>Sincerely,<br/>The Authors</p>`;

  return generateDocHTML(`Cover Letter — ${params.journalName}`, body);
}

/**
 * Generate a submission checklist text file
 */
function generateChecklist(items: string[]): string {
  const header = "Submission Checklist\n" + "=".repeat(40) + "\n\n";
  const list = items
    .map((item, i) => `[ ] ${i + 1}. ${item}`)
    .join("\n");
  return header + list + "\n";
}

/**
 * Assemble and download a submission package as ZIP.
 */
export async function downloadSubmissionPackage(params: {
  projectId: string;
  manuscriptId: string;
  journalName: string;
  checklistItems?: string[];
}): Promise<void> {
  const { manuscriptId, journalName, checklistItems } = params;

  const zip = new JSZip();

  // 1. Manuscript document
  let blocks: LocalManuscriptBlock[] = [];
  let manuscript: LocalManuscript | undefined;

  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const [blocksResult, manuscriptResult] = await Promise.all([
      client.from("manuscript_blocks").select("*").eq("manuscript_id", manuscriptId).order("ordinal"),
      client.from("manuscripts").select("*").eq("id", manuscriptId).maybeSingle(),
    ]);
    if (blocksResult.error) throw blocksResult.error;
    if (manuscriptResult.error) throw manuscriptResult.error;
    blocks = (blocksResult.data ?? []).map(
      (row) => fromRemoteRecord(row as Record<string, unknown>) as unknown as LocalManuscriptBlock
    );
    manuscript = manuscriptResult.data
      ? (fromRemoteRecord(manuscriptResult.data as Record<string, unknown>) as unknown as LocalManuscript)
      : undefined;
  } else {
    blocks = await localDB.manuscriptBlocks
      .where("manuscriptId")
      .equals(manuscriptId)
      .sortBy("order");
    manuscript = await localDB.manuscripts.get(manuscriptId);
  }

  // Render each block as a titled section, in stored order.
  const manuscriptHTML = blocks
    .map((block) => {
      const sectionTitle = block.section
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `<h2>${escapeHTML(sectionTitle)}</h2>\n${markdownToSimpleHTML(block.content)}`;
    })
    .join("\n\n");

  const manuscriptDoc = generateDocHTML("Manuscript", manuscriptHTML);
  zip.file("manuscript.doc", manuscriptDoc);

  // 2. Cover letter
  const coverLetter = generateCoverLetter({
    journalName,
    paperTitle: manuscript?.title ?? "Untitled Manuscript",
    abstract: manuscript?.abstract,
  });
  zip.file("cover-letter.doc", coverLetter);

  // 3. Submission checklist
  const defaultChecklist = [
    "Manuscript formatted according to journal guidelines",
    "Title page with all author details",
    "Abstract within word limit",
    "Keywords provided",
    "All figures and tables included",
    "References in correct format",
    "Cover letter prepared",
    "All authors approved the final version",
    "Conflict of interest statement included",
    "Data availability statement included",
  ];
  const checklist = generateChecklist(checklistItems ?? defaultChecklist);
  zip.file("checklist.txt", checklist);

  // 4. Generate ZIP and trigger download
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `submission-${journalName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Lightweight Markdown ↔ HTML conversion utilities.
 * Handles the common markdown patterns found in academic AI output.
 *
 * Functionality:
 * - Exposes `markdownToHtml`, which converts Markdown to Tiptap-ready HTML via `marked`.
 * - Exposes `htmlToMarkdown`, a regex-based conversion of Tiptap HTML back to Markdown.
 * - Includes helpers that normalize model output collapsed onto one line and rebuild malformed GFM tables.
 *
 * Notes:
 * - Tolerates streamed/incomplete Markdown; imports `marked` at the bottom of the file.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/**
 * Convert markdown to HTML for Tiptap initialization.
 */
export function markdownToHtml(md: string): string {
  const normalized = normalizeCollapsedMarkdown(md);
  let html = marked.parse(normalized, {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;
  if (!html.includes("<table")) {
    const fallback = renderCollapsedTable(normalized);
    if (fallback) html = fallback;
  }
  // If a malformed streamed delimiter survives parsing, remove the marker
  // rather than exposing Markdown syntax in the chat bubble.
  if (html.includes("**")) html = html.replace(/\*\*/g, "");
  return html;
}

/** Rebuilds a collapsed GFM table when `marked` fails to detect one. */
function renderCollapsedTable(value: string): string | null {
  const divider = /\|(?:[ \t]*:?-+[ \t]*\|[ \t]*){2,}/;
  const dividerMatch = divider.exec(value);
  if (!dividerMatch || dividerMatch.index === undefined) return null;
  const dividerStart = dividerMatch.index;
  const before = value.slice(0, dividerStart);
  const colon = Math.max(before.lastIndexOf("："), before.lastIndexOf(":"));
  const newline = before.lastIndexOf("\n");
  const tableStart = colon >= 0
    ? value.indexOf("|", colon + 1)
    : Math.max(newline + 1, before.indexOf("|"));
  const header = before.slice(tableStart).split("|").map((cell) => cell.trim()).filter(Boolean);
  const afterDivider = value.slice(dividerStart + dividerMatch[0].length);
  const tailIndex = afterDivider.lastIndexOf(" --- ");
  const bodyText = tailIndex >= 0 ? afterDivider.slice(0, tailIndex) : afterDivider;
  const tail = tailIndex >= 0 ? afterDivider.slice(tailIndex) : "";
  const cells = bodyText.split("|").map((cell) => cell.trim()).filter(Boolean);
  if (header.length < 2 || cells.length < header.length) return null;
  const rows: string[][] = [];
  for (let index = 0; index + header.length <= cells.length; index += header.length) {
    rows.push(cells.slice(index, index + header.length));
  }
  const inline = (text: string) => marked.parseInline(text, { async: false }) as string;
  const table = `<table><thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const prefix = value.slice(0, tableStart);
  return `${marked.parse(prefix, { gfm: true, breaks: true, async: false })}${table}${marked.parse(tail, { gfm: true, breaks: true, async: false })}`;
}

/** Recover common block boundaries when an upstream model returns Markdown on one line. */
function normalizeCollapsedMarkdown(md: string): string {
  let normalized = md.replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, "\t").replace(/\r\n?/g, "\n");
  // Models sometimes emit `***` as a bold marker or leave one `**` open
  // while streaming. Normalize the former and discard only an unmatched
  // final marker so the whole message does not fall back to raw text.
  normalized = normalized.replace(/\*\*\*/g, "**");
  // Tolerate model output such as `**内容？ **` and `** 内容**`.
  // CommonMark requires the delimiter to touch the emphasized text.
  normalized = normalized
    .replace(/\*\*[ \t]+(?=\S)/g, "**")
    .replace(/(\S)[ \t]+\*\*/g, "$1**");
  const emphasisMarkers = normalized.match(/\*\*/g) ?? [];
  if (emphasisMarkers.length % 2 === 1) {
    const last = normalized.lastIndexOf("**");
    if (last >= 0) normalized = normalized.slice(0, last) + normalized.slice(last + 2);
  }
  normalized = normalized
    .replace(/---[ \t]+(?=#{1,6}\s)/g, "\n\n---\n\n")
    .replace(/([：:。.!?])[ \t]+---[ \t]+(?=\|)/g, "$1\n\n---\n\n");
  // Headings and list items that follow prose without a newline.
  normalized = normalized
    .replace(/([^\n])\s+(#{1,6}\s+)/g, "$1\n\n$2")
    .replace(/([^\n])\s+([-*]\s+)/g, "$1\n$2")
    .replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2")
    .replace(/(?<!\|)[ \t]+---[ \t]+(?!\|)/g, "\n\n---\n\n");
  normalized = normalized.replace(/^(#{1,6}\s+[^|\n]+?)\s+(?=\|)/gm, "$1\n");
  // A common compact-table separator has an empty cell between the header
  // and divider: `| Header | |------|------|`.
  normalized = normalized.replace(/\|[ \t]+\|(?=[ \t]*:?-{2,})/g, "|\n|");
  // GFM tables commonly arrive as: header | | --- | --- | | row...
  normalized = normalized
    .replace(/(\|[^|\n]+(?:\|[^|\n]+)+\|)[ \t]+(\|[ \t]*:?-+[ \t]*(?:\|[ \t]*:?-+[ \t]*)+\|)[ \t]+(\|[^|\n]+(?:\|[^|\n]+)+\|)/g, "$1\n$2\n$3")
    .replace(/\|[ \t]+\|(?=[ \t]*[-:])/g, "|\n|")
    .replace(/\|[ \t]+(?=\*\*[^|]+\*\*[ \t]*\|)/g, "|\n|")
    .replace(/(\|[-:]+(?:\|[-:]+)+\|)[ \t]+(?=\|?[^|])/g, "$1\n")
    ;
  return normalized;
}

/**
 * Convert Tiptap HTML output back to markdown.
 */
export function htmlToMarkdown(html: string): string {
  let md = html;

  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");

  // Bold and italic
  md = md.replace(/<strong><em>(.*?)<\/em><\/strong>/gi, "***$1***");
  md = md.replace(/<em><strong>(.*?)<\/strong><\/em>/gi, "***$1***");
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");

  // Strikethrough
  md = md.replace(/<s>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<strike>(.*?)<\/strike>/gi, "~~$1~~");

  // Code blocks
  md = md.replace(
    /<pre><code class="language-(\w+)"[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    "```$1\n$2\n```\n\n"
  );
  md = md.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```\n\n");

  // Inline code
  md = md.replace(/<code>(.*?)<\/code>/gi, "`$1`");

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");

  // Blockquotes
  md = md.replace(/<blockquote[^>]*><p>(.*?)<\/p><\/blockquote>/gi, "> $1\n\n");
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n\n");

  // Lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let i = 1;
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${i++}. $1\n`);
  });

  // Horizontal rules
  md = md.replace(/<hr\s*\/?>/gi, "---\n\n");

  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}
import { marked } from "marked";

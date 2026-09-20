/**
 * MarkdownText UI primitive (components/ui/markdown-text.tsx)
 *
 * Functionality:
 * - Converts Markdown to HTML via markdownToHtml and renders it with dangerouslySetInnerHTML.
 * - Escapes raw input and sanitizes generated HTML, stripping scripts, event handlers and unsafe URLs.
 *
 * Notes:
 * - Sanitization is regex-based; treat it as a defensive filter rather than a full HTML sanitizer.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { markdownToHtml } from "@/components/editor/markdown-convert";

function escapeMarkdownHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeGeneratedHtml(html: string) {
  return html
    .replace(/<\/?(script|style|iframe|object|embed|form|svg|math)[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)="([^"]*)"/gi, (_match, attribute, value) => {
      const decoded = value.replace(/&#x?([0-9a-f]+);?/gi, (_m: string, code: string) => String.fromCharCode(parseInt(code, 16)));
      const safe = /^(https?:|mailto:|#|\/)/i.test(decoded) && !/^javascript:/i.test(decoded) ? decoded : "#";
      return attribute + "=\"" + safe.replace(/\"/g, "&quot;") + "\"";
    });
}

/** Renders sanitized Markdown as styled HTML. */
export function MarkdownText({ content, className = "" }: { content: string; className?: string }) {
  const html = sanitizeGeneratedHtml(markdownToHtml(escapeMarkdownHtml(content)));
  return <div className={`markdown-content text-sm leading-7 ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

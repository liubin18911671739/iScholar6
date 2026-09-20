/**
 * CitationMark (components/editor/extensions/citation-mark.tsx)
 *
 * Functionality:
 * - Defines a Tiptap inline "citation" mark carrying a `key` attribute.
 * - Parses `<cite>` and `<span data-citation>` nodes and renders them as styled `<cite>` elements.
 * - Adds input and paste rules recognizing `[@key]` citation syntax.
 *
 * Notes:
 * - Registered in `rich-editor.tsx`; the inserted mark text is `[@key]`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { Mark, markInputRule, markPasteRule } from "@tiptap/core";

/** Options for the citation mark extension. */
export interface CitationMarkOptions {
  HTMLAttributes: Record<string, string>;
}

/** Tiptap mark representing an inline citation reference. */
export const CitationMark = Mark.create<CitationMarkOptions>({
  name: "citation",
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      key: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'cite',
      },
      {
        tag: 'span[data-citation]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "cite",
      {
        ...HTMLAttributes,
        class: "citation-mark",
        style:
          "background-color: hsl(var(--primary) / 0.15); border-radius: 2px; padding: 0 2px; font-style: normal; font-size: 0.9em;",
      },
      0,
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)\[@([a-zA-Z0-9_]+)\]\s$/,
        type: this.type,
        getAttributes: (match) => ({
          key: match[1],
        }),
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: /\[@([a-zA-Z0-9_]+)\]/g,
        type: this.type,
        getAttributes: (match) => ({
          key: match[1],
        }),
      }),
    ];
  },
});

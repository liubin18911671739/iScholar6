/**
 * latex (components/editor/extensions/latex.tsx)
 *
 * Functionality:
 * - Defines Tiptap inline (`mathInline`) and block (`mathBlock`) math nodes whose `latex` attr renders via KaTeX.
 * - Provides React node views for both nodes and input rules converting `$...$` and `$$...$$` to math nodes.
 * - Falls back to escaped, error-styled text when KaTeX rendering throws.
 *
 * Notes:
 * - Registered in `rich-editor.tsx`; KaTeX styles are imported there.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import katex from "katex";

// Escapes HTML special characters for safe fallback rendering.
function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Inline Math Node ───────────────────────────────────────────────────

// React node view that renders inline LaTeX with KaTeX.
const MathInlineComponent = ({ node }: NodeViewProps) => {
  const latex = (node.attrs.latex as string) ?? "";

  let rendered = "";
  try {
    rendered = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  } catch {
    rendered = `<span class="text-destructive">${escapeHtml(latex)}</span>`;
  }

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className="cursor-pointer rounded bg-muted/50 px-1 font-mono text-sm"
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: rendered }}
        title={`$${latex}$`}
      />
    </NodeViewWrapper>
  );
};

/** Tiptap inline math node rendering LaTeX via KaTeX. */
export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "math-inline" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineComponent);
  },

  addInputRules() {
    return [
      {
        // Match $...$ inline math
        find: /(?:^|[^$])\$([^$]+)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          const offset = match[0].startsWith("$") ? 0 : 1;
          const from = range.from + offset;
          const to = range.to;

          state.tr
            .delete(from, to)
            .insert(
              from,
              this.type.create({ latex })
            );
        },
      },
    ];
  },
});

// ── Block Math Node ────────────────────────────────────────────────────

// React node view that renders display-mode LaTeX with KaTeX.
const MathBlockComponent = ({ node }: NodeViewProps) => {
  const latex = (node.attrs.latex as string) ?? "";

  let rendered = "";
  try {
    rendered = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    rendered = `<span class="text-destructive">${escapeHtml(latex)}</span>`;
  }

  return (
    <NodeViewWrapper>
      <div
        className="my-2 cursor-pointer rounded border bg-muted/30 p-3 text-center"
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: rendered }}
        title={`$$${latex}$$`}
      />
    </NodeViewWrapper>
  );
};

/** Tiptap block-level math node rendering display LaTeX via KaTeX. */
export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "math-block" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockComponent);
  },

  addInputRules() {
    return [
      {
        // Match $$...$$ block math
        find: /\$\$([^$]+)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          state.tr
            .delete(range.from, range.to)
            .insert(range.from, this.type.create({ latex }));
        },
      },
    ];
  },
});

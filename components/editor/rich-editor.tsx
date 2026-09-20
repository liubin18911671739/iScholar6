/**
 * RichEditor (components/editor/rich-editor.tsx)
 *
 * Functionality:
 * - Tiptap-based rich editor with StarterKit, images, links, tables, highlight, placeholder, math, and citation marks.
 * - Converts Markdown content to/from editor HTML and exposes imperative `exportMarkdown`, `importMarkdown`, and `getHTML`.
 * - Renders an optional toolbar (with citation insert and version-history sheet) and calls `onChange` with HTML on updates.
 *
 * Notes:
 * - Extensions come from `./extensions/latex` and `./extensions/citation-mark`; uses `./markdown-convert` and KaTeX CSS.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useCallback,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { useTranslations } from "next-intl";
import { MathInline, MathBlock } from "./extensions/latex";
import { CitationMark } from "./extensions/citation-mark";
import { EditorToolbar } from "./editor-toolbar";
import { ToolbarButton } from "./editor-toolbar";
import { CitationInsert } from "@/components/citations/citation-insert";
import { VersionPanel } from "./version-panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { History } from "lucide-react";
import { markdownToHtml, htmlToMarkdown } from "./markdown-convert";
import "katex/dist/katex.min.css";

/** Imperative handle exposed by `RichEditor` for Markdown/HTML conversion. */
export interface RichEditorHandle {
  exportMarkdown: () => string;
  importMarkdown: (md: string) => void;
  getHTML: () => string;
}

/** Props for `RichEditor`: content, change handler, editability, and project/block context. */
interface RichEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  projectId?: string;
  blockId?: string;
  placeholder?: string;
}

/** Forward-ref rich text editor backed by Tiptap. */
export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor(
    { content, onChange, editable = true, projectId, blockId, placeholder },
    ref
  ) {
    const t = useTranslations("editor");
    const [historyOpen, setHistoryOpen] = useState(false);
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Image,
        Link.configure({ openOnClick: false }),
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        Highlight,
        Placeholder.configure({
          placeholder: placeholder ?? "开始撰写...",
        }),
        MathInline,
        MathBlock,
        CitationMark,
      ],
      content: content ? markdownToHtml(content) : "",
      editable,
      onUpdate: ({ editor: ed }) => {
        onChange?.(ed.getHTML());
      },
      editorProps: {
        attributes: {
          class:
            "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] px-1 py-2",
        },
      },
    });

    // Sync content when it changes externally
    useEffect(() => {
      if (editor && content !== undefined) {
        const currentHtml = editor.getHTML();
        const newHtml = content ? markdownToHtml(content) : "";
        if (currentHtml !== newHtml) {
          editor.commands.setContent(newHtml);
        }
      }
    }, [content, editor]);

    // Sync editable state
    useEffect(() => {
      if (editor) {
        editor.setEditable(editable);
      }
    }, [editable, editor]);

    const exportMarkdown = useCallback(() => {
      if (!editor) return "";
      return htmlToMarkdown(editor.getHTML());
    }, [editor]);

    const importMarkdown = useCallback(
      (md: string) => {
        if (!editor) return;
        editor.commands.setContent(markdownToHtml(md));
      },
      [editor]
    );

    const getHTML = useCallback(() => {
      if (!editor) return "";
      return editor.getHTML();
    }, [editor]);

    useImperativeHandle(ref, () => ({
      exportMarkdown,
      importMarkdown,
      getHTML,
    }));

    // Inserts `[@key]` text carrying the citation mark at the cursor.
    const handleInsertCitation = useCallback(
      (key: string) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "text",
              marks: [{ type: "citation", attrs: { key } }],
              text: `[@${key}]`,
            },
          ])
          .run();
      },
      [editor]
    );

    if (!editor) return null;

    return (
      <div className="rich-editor rounded-md border">
        {editable && (
          <div className="px-2 pt-2">
            <EditorToolbar editor={editor}>
              {projectId && (
                <CitationInsert
                  projectId={projectId}
                  onInsertCitation={handleInsertCitation}
                />
              )}
              {blockId && editable && (
                <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
                  <SheetTrigger asChild>
                    <ToolbarButton
                      icon={History}
                      label={t("history")}
                      onClick={() => setHistoryOpen(true)}
                    />
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>{t("history")}</SheetTitle>
                    </SheetHeader>
                    <VersionPanel
                      blockId={blockId}
                      currentContent={content ?? ""}
                    />
                  </SheetContent>
                </Sheet>
              )}
            </EditorToolbar>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    );
  }
);

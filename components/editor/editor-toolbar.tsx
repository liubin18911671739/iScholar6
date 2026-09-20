/**
 * EditorToolbar (components/editor/editor-toolbar.tsx)
 *
 * Functionality:
 * - Tiptap editor toolbar with formatting buttons (bold, italic, headings, lists, links, tables, undo/redo).
 * - Inserts inline or block math based on the LaTeX string length/newlines, and prompts for link/image URLs.
 * - Renders a `children` slot used for the citation-insert popover and the version-history sheet.
 *
 * Notes:
 * - Depends on the Tiptap `Editor` instance and next-intl labels; exports the reusable `ToolbarButton`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { type Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link,
  Image,
  Table,
  Undo,
  Redo,
  Pi,
} from "lucide-react";

/** Props for `EditorToolbar`: the Tiptap editor and optional slot content. */
interface EditorToolbarProps {
  editor: Editor;
  projectId?: string;
  children?: React.ReactNode; // For citation insert popover etc.
}

/** Icon button with a tooltip and active state, used across the toolbar. */
export function ToolbarButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onClick}
          type="button"
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Full formatting toolbar for the rich editor. */
export function EditorToolbar({ editor, children }: EditorToolbarProps) {
  const t = useTranslations("editor");

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-0.5 border-b pb-2 mb-2 flex-wrap">
        <ToolbarButton
          icon={Bold}
          label={t("bold")}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label={t("italic")}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label={t("strikethrough")}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          icon={Code}
          label={t("inlineCode")}
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={Heading1}
          label={t("heading1")}
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          icon={Heading2}
          label={t("heading2")}
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon={Heading3}
          label={t("heading3")}
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={List}
          label={t("bulletList")}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label={t("orderedList")}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={Quote}
          label={t("blockquote")}
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={Link}
          label={t("insertLink")}
          onClick={() => {
            const url = window.prompt(t("linkUrl"));
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
        />
        <ToolbarButton
          icon={Image}
          label={t("insertImage")}
          onClick={() => {
            const url = window.prompt(t("imageUrl"));
            if (url) {
              editor.chain().focus().setImage({ src: url }).run();
            }
          }}
        />
        <ToolbarButton
          icon={Table}
          label={t("insertTable")}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        />
        <ToolbarButton
          icon={Pi}
          label={t("insertMath")}
          onClick={() => {
            const latex = window.prompt(t("mathLatex"));
            if (latex) {
              if (latex.includes("\n") || latex.length > 50) {
                editor.chain().focus().insertContent({
                  type: "mathBlock",
                  attrs: { latex },
                }).run();
              } else {
                editor.chain().focus().insertContent({
                  type: "mathInline",
                  attrs: { latex },
                }).run();
              }
            }
          }}
        />

        {/* Citation insert slot */}
        {children}

        {/* History button slot — rendered by parent if version panel is available */}
        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={Undo}
          label={t("undo")}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon={Redo}
          label={t("redo")}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>
    </TooltipProvider>
  );
}

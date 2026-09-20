/**
 * Write Editor Ref (components/agents/configs/write/editor-ref.ts)
 *
 * Functionality:
 * - Holds a module-scoped reference to the rich editor mounted by the write agent's results panel.
 * - Exposes getter/setter helpers so customOnApply can export the editor's markdown without prop drilling.
 *
 * Notes:
 * - Mutable module state; only one write editor is expected to be mounted at a time.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { RichEditorHandle } from "@/components/editor/rich-editor";

/** Module-scoped editor ref — bridges WriteResults (renders the editor) with WriteConfig.customOnApply (exports content). */
let _writeEditorRef: RichEditorHandle | null = null;

/** Returns the currently mounted write editor handle, if any. */
export function getWriteEditorRef(): RichEditorHandle | null {
  return _writeEditorRef;
}

/** Stores or clears the mounted write editor handle. */
export function setWriteEditorRef(ref: RichEditorHandle | null): void {
  _writeEditorRef = ref;
}

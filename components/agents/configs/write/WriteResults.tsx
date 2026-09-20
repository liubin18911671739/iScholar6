/**
 * WriteResults (components/agents/configs/write/WriteResults.tsx)
 *
 * Functionality:
 * - Renders the Write agent output in a `RichEditor` bound to the generated content.
 * - Makes the editor editable only once the run reaches `needs_review`, `approved`, or `applied`.
 * - Registers the editor instance through `setWriteEditorRef` so parent code can export or modify it.
 *
 * Notes:
 * - Collaborates with `RichEditor` and `editor-ref`; placeholder reflects the selected section.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { RichEditor } from "@/components/editor/rich-editor";
import { setWriteEditorRef } from "./editor-ref";
import type { ResultsProps } from "../../agent-page-template";

/** Write agent results editor toggle for review/approval states. */
export function WriteResults({ results, status, projectId, fieldState }: ResultsProps) {
  const isEditable = status === "needs_review" || status === "approved" || status === "applied";
  return (
    <RichEditor
      ref={(el) => setWriteEditorRef(el)}
      content={results}
      editable={isEditable}
      projectId={projectId}
      placeholder={`Writing ${fieldState.section ?? "section"}...`}
    />
  );
}

/**
 * Write Config (components/agents/configs/write/config.ts)
 *
 * Functionality:
 * - Declares the writing agent page config: inputs, custom results editor, output panel, and module layout.
 * - Defines write/polish/format sub-features for the writing workflow.
 * - Custom apply exports the editor's markdown into the mapped manuscript section.
 *
 * Notes:
 * - Uses getWriteEditorRef to read content from the mounted rich editor instead of raw results.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createManuscript, createManuscriptBlock } from "@/lib/local/hooks";
import type { AgentPageConfig } from "../../agent-page-template";
import { WriteOutputPanel } from "@/components/agents/outputs/write-output";
import { WriteInputs } from "./WriteInputs";
import { WriteResults } from "./WriteResults";
import { WriteModuleContent } from "./WriteModuleContent";
import { getWriteEditorRef } from "./editor-ref";

/** Configuration for the academic-writing agent page with three sub-features. */
export const WRITE_CONFIG: AgentPageConfig = {
  agentId: "write",
  InputsComponent: WriteInputs,
  ResultsComponent: WriteResults,
  OutputComponent: WriteOutputPanel,
  buildRunInput: (fs) => ({
    section: fs.section ?? "introduction",
    citationStyle: fs.citationStyle ?? "APA",
  }),
  // Exports editor markdown (or raw results) and saves it to the mapped manuscript section.
  customOnApply: async ({ results, projectId, manuscripts, handleApply, fieldState }) => {
    const content = getWriteEditorRef()?.exportMarkdown() ?? results ?? "";
    if (!content || !projectId) return;
    let manuscriptId = manuscripts?.[0]?.id;
    if (!manuscriptId) {
      manuscriptId = await createManuscript({ projectId, title: "Untitled Manuscript" });
    }
    const contentWithoutJson = content.replace(/```json[\s\S]*?```/g, "").trim();
    const section = fieldState.section ?? "introduction";
    // Maps manuscript section names to their ordering index.
    const sectionOrder: Record<string, number> = {
      abstract: 0, introduction: 1, methods: 2, results: 3, discussion: 4, conclusion: 5,
    };
    await createManuscriptBlock({
      manuscriptId,
      section,
      order: sectionOrder[section] ?? 1,
      content: contentWithoutJson,
    });
    handleApply();
  },
  ModuleContentComponent: WriteModuleContent,
  subFeatures: [
    { value: "write", labelKey: "write.write" },
    { value: "polish", labelKey: "write.polish" },
    { value: "format", labelKey: "write.format" },
  ],
};

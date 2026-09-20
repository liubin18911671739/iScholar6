/**
 * Topic Config (components/agents/configs/topic/config.ts)
 *
 * Functionality:
 * - Declares the topic-selection agent page config: inputs, output panel, run input mapping, and module layout.
 * - Defines discovery/literature/trends sub-features, each supplying its own buildRunInput variant.
 * - Maps applied results into the "topic" manuscript section.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { AgentPageConfig } from "../../agent-page-template";
import { TopicOutputPanel } from "@/components/agents/outputs/topic-output";
import { TopicInputs } from "./TopicInputs";
import { TopicModuleContent } from "./TopicModuleContent";

/** Configuration for the topic-selection agent page with three sub-features. */
export const TOPIC_CONFIG: AgentPageConfig = {
  agentId: "topic",
  InputsComponent: TopicInputs,
  OutputComponent: TopicOutputPanel,
  buildRunInput: (fs) => ({
    analysisMode: "discovery",
    discipline: fs.discipline,
    keywords: (fs.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
    targetJournal: fs.targetJournal,
  }),
  manuscriptSection: "topic",
  manuscriptOrder: 0,
  ModuleContentComponent: TopicModuleContent,
  subFeatures: [
    { value: "discovery", labelKey: "topic.discovery", buildRunInput: (fs) => ({
      analysisMode: "discovery",
      discipline: fs.discipline,
      keywords: (fs.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
      targetJournal: fs.targetJournal,
    }) },
    { value: "literature", labelKey: "topic.literature", buildRunInput: (fs) => ({
      analysisMode: "literature",
      discipline: fs.discipline,
      keywords: (fs.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
      targetJournal: fs.targetJournal,
    }) },
    { value: "trends", labelKey: "topic.trends", buildRunInput: (fs) => ({
      analysisMode: "trends",
      discipline: fs.discipline,
      keywords: (fs.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
      targetJournal: fs.targetJournal,
    }) },
  ],
};

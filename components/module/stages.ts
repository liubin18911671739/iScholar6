/**
 * Stages (components/module/stages.ts)
 *
 * Functionality:
 * - Defines the 8-stage research workflow (topic through rebuttal) with labels and per-stage accent palettes.
 * - Maps each agent route to its primary stage and resolves module display names.
 * - Provides lookup helpers (`getStage`, `primaryStageForAgent`, `moduleNameForAgent`) shared across module UI.
 *
 * Notes:
 * - Stages 4 and 5 both map to the `data` agent; plugin agents return stage 0 and fall back to their own name.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { isBuiltInAgent, type BuiltInAgentId } from "@/lib/ai/agents/registry";

/**
 * The 8-stage research workflow rendered as the horizontal stepper on
 * every module page (选题 → 综述 → 设计 → 数据 → 分析 → 写作 → 投稿 → 返修&展示).
 *
 * Note: the app only has 7 agent routes. Stage 4 (数据) and 5 (分析)
 * both map to the `data` agent; the data module shows stage 5 active.
 */
export interface StageDef {
  id: number;
  agentId: BuiltInAgentId;
  /** Chinese module display name (shown in the top bar, before "· 学伴智枢") */
  module: string;
  /** Short node label on the stepper */
  label: string;
  /** English fallback label */
  enLabel: string;
  /** Per-stage accent — all static class strings so Tailwind JIT emits them */
  accent: {
    text: string;
    nodeBg: string;
    nodeBorder: string;
    nodeText: string;
    line: string;
    glow: string;
    chip: string;
    soft: string;
  };
}

// Static per-stage accent palettes; literal class strings so Tailwind JIT emits them.
const CYAN = {
  text: "text-cyan-300",
  nodeBg: "bg-cyan-500 text-white",
  nodeBorder: "border-cyan-400",
  nodeText: "text-cyan-200",
  line: "bg-cyan-400/60",
  glow: "shadow-[0_0_22px_-2px_rgba(34,211,238,0.7)]",
  chip: "bg-cyan-500/15 text-cyan-200 border-cyan-400/30",
  soft: "ring-cyan-400/40",
};
const SKY = {
  text: "text-sky-300",
  nodeBg: "bg-sky-500 text-white",
  nodeBorder: "border-sky-400",
  nodeText: "text-sky-200",
  line: "bg-sky-400/60",
  glow: "shadow-[0_0_22px_-2px_rgba(56,189,248,0.7)]",
  chip: "bg-sky-500/15 text-sky-200 border-sky-400/30",
  soft: "ring-sky-400/40",
};
const VIOLET = {
  text: "text-violet-300",
  nodeBg: "bg-violet-500 text-white",
  nodeBorder: "border-violet-400",
  nodeText: "text-violet-200",
  line: "bg-violet-400/60",
  glow: "shadow-[0_0_22px_-2px_rgba(167,139,250,0.7)]",
  chip: "bg-violet-500/15 text-violet-200 border-violet-400/30",
  soft: "ring-violet-400/40",
};
const TEAL = {
  text: "text-teal-300",
  nodeBg: "bg-teal-500 text-white",
  nodeBorder: "border-teal-400",
  nodeText: "text-teal-200",
  line: "bg-teal-400/60",
  glow: "shadow-[0_0_22px_-2px_rgba(45,212,191,0.7)]",
  chip: "bg-teal-500/15 text-teal-200 border-teal-400/30",
  soft: "ring-teal-400/40",
};
const BLUE = {
  text: "text-blue-300",
  nodeBg: "bg-blue-500 text-white",
  nodeBorder: "border-blue-400",
  nodeText: "text-blue-200",
  line: "bg-blue-400/60",
  glow: "shadow-[0_0_22px_-2px_rgba(96,165,250,0.7)]",
  chip: "bg-blue-500/15 text-blue-200 border-blue-400/30",
  soft: "ring-blue-400/40",
};
const EMERALD = {
  text: "text-emerald-300",
  nodeBg: "bg-emerald-500 text-white",
  nodeBorder: "border-emerald-400",
  nodeText: "text-emerald-200",
  line: "bg-emerald-400/60",
  glow: "shadow-[0_0_22px_-2px_rgba(52,211,153,0.7)]",
  chip: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  soft: "ring-emerald-400/40",
};
const FUCHSIA = {
  text: "text-fuchsia-300",
  nodeBg: "bg-fuchsia-500 text-white",
  nodeBorder: "border-fuchsia-400",
  nodeText: "text-fuchsia-200",
  line: "bg-fuchsia-400/60",
  glow: "shadow-[0_0_22px_-2px_rgba(232,121,249,0.7)]",
  chip: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30",
  soft: "ring-fuchsia-400/40",
};

/** Ordered workflow stages rendered by the stepper and breadcrumb. */
export const STAGES: StageDef[] = [
  { id: 1, agentId: "topic", module: "选题探索", label: "选题", enLabel: "Topic", accent: CYAN },
  { id: 2, agentId: "litreview", module: "文献综述", label: "综述", enLabel: "Review", accent: SKY },
  { id: 3, agentId: "design", module: "研究设计", label: "设计", enLabel: "Design", accent: VIOLET },
  { id: 4, agentId: "data", module: "数据采集", label: "数据", enLabel: "Data", accent: TEAL },
  { id: 5, agentId: "data", module: "数据分析", label: "分析", enLabel: "Analysis", accent: TEAL },
  { id: 6, agentId: "write", module: "论文撰写", label: "写作", enLabel: "Writing", accent: BLUE },
  { id: 7, agentId: "submit", module: "投稿匹配", label: "投稿", enLabel: "Submit", accent: EMERALD },
  { id: 8, agentId: "rebuttal", module: "返修与展示", label: "返修&展示", enLabel: "Rebuttal", accent: FUCHSIA },
];

/** The primary (most representative) stage id for a given agent route. Returns 0 for plugin agents. */
export function primaryStageForAgent(agentId: string): number {
  if (!isBuiltInAgent(agentId)) return 0;
  switch (agentId) {
    case "topic":
      return 1;
    case "litreview":
      return 2;
    case "design":
      return 3;
    case "data":
      return 5;
    case "write":
      return 6;
    case "submit":
      return 7;
    case "rebuttal":
      return 8;
  }
}

/** Returns the stage definition for a 1-based stage id, or undefined when out of range. */
export function getStage(id: number): StageDef | undefined {
  if (id < 1 || id > STAGES.length) return undefined;
  return STAGES[id - 1];
}

/** Module display name for an agent route (e.g. "选题探索"). */
export function moduleNameForAgent(agentId: string): string {
  if (!isBuiltInAgent(agentId)) {
    return agentId.startsWith("p.") ? agentId.split(".").slice(2).join(".") || agentId : agentId;
  }
  const stage = getStage(primaryStageForAgent(agentId));
  return stage?.module ?? agentId;
}

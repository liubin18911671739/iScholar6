/**
 * Prompt Resolve (lib/plugins/prompt-resolve.ts)
 *
 * Functionality:
 * - Resolves system and user prompts for built-in and plugin agents.
 * - Applies active prompt-pack overrides first, then agent defaults.
 * - Provides mustache-like `{{field}}` templating and built-in user-prompt assembly.
 *
 * Notes:
 * - Reads pack selections from Dexie and consults the plugin registry for overrides/agents.
 * - Uses lazy dynamic import of agent meta to avoid circular dependencies.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import {
  isBuiltInAgent,
  type BuiltInAgentId,
} from "@/lib/ai/agents/registry";
import { buildAgentContext } from "@/lib/ai/agents/context";
import {
  TOPIC_SCOUT_PROMPT,
  LIT_REVIEW_PROMPT,
  DESIGN_PROMPT,
  DATA_PILOT_PROMPT,
  IMRAD_WRITER_PROMPT,
  SUBMIT_MATCH_PROMPT,
  REBUTTAL_PROMPT,
} from "@/lib/ai/prompts";
import { localDB } from "@/lib/local/db";
import { findPackOverride, getPluginAgent } from "./registry";

// Built-in system prompts keyed by built-in agent id.
const BUILTIN_PROMPTS: Record<BuiltInAgentId, string> = {
  topic: TOPIC_SCOUT_PROMPT,
  litreview: LIT_REVIEW_PROMPT,
  design: DESIGN_PROMPT,
  data: DATA_PILOT_PROMPT,
  write: IMRAD_WRITER_PROMPT,
  submit: SUBMIT_MATCH_PROMPT,
  rebuttal: REBUTTAL_PROMPT,
};

/** Return the built-in system prompt for a built-in agent id. */
export function getBuiltinSystemPrompt(agentId: BuiltInAgentId): string {
  return BUILTIN_PROMPTS[agentId];
}

// Read the persisted pack ref for an agent, swallowing storage errors.
async function getPackSelection(agentId: string): Promise<string | undefined> {
  try {
    const row = await localDB.promptPackSelections.get(agentId);
    return row?.packRef;
  } catch {
    return undefined;
  }
}

/**
 * Resolve system prompt: active pack override → built-in / plugin default.
 */
export async function resolveSystemPrompt(agentId: string): Promise<string> {
  const packRef = await getPackSelection(agentId);
  if (packRef && packRef !== "builtin") {
    const override = findPackOverride(packRef, agentId);
    if (override?.systemPrompt) return override.systemPrompt;
  }

  if (isBuiltInAgent(agentId)) return BUILTIN_PROMPTS[agentId];

  const pluginAgent = getPluginAgent(agentId);
  if (pluginAgent) return pluginAgent.systemPrompt;

  throw new Error(`Unknown agent: ${agentId}`);
}

/** Simple `{{field}}` substitution; unknown keys become empty string. */
export function applyTemplate(
  template: string,
  input: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => {
    const value = input[key];
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
}

/**
 * Built-in user prompt assembly (legacy switch).
 * Kept here so plugin resolver can fall through without circular imports.
 */
export async function buildBuiltinUserPrompt(
  agentId: BuiltInAgentId,
  input: Record<string, unknown>,
  projectId?: string
): Promise<string> {
  let upstreamContext = "";
  // Lazy import meta to avoid circular deps with registry consumers.
  const { AGENT_META } = await import("@/lib/ai/agents/registry");
  const meta = AGENT_META[agentId];
  if (projectId && meta.contextFrom?.length) {
    upstreamContext = await buildAgentContext(projectId, meta.contextFrom);
  }

  switch (agentId) {
    case "topic": {
      const discipline = input.discipline || "general";
      const keywords = Array.isArray(input.keywords)
        ? input.keywords.join(", ")
        : "none specified";
      const journal = input.targetJournal
        ? `Target journal: ${input.targetJournal}.`
        : "";
      const mode = input.analysisMode;
      if (mode === "literature") {
        return `Perform a literature-focused topic analysis for "${discipline}" using these keywords: ${keywords}. ${journal} Identify major research themes, representative findings, methodological limitations, and concrete research gaps. Convert the gaps into 3 candidate research topics with novelty, value, feasibility, and rationale.`;
      }
      if (mode === "trends") {
        return `Perform a research trend analysis for "${discipline}" using these keywords: ${keywords}. ${journal} Identify emerging directions, recent momentum, likely future developments, and underserved questions. Recommend 3 candidate research topics with novelty, value, feasibility, and rationale.`;
      }
      return `Analyze research opportunities in "${discipline}" with focus on these keywords: ${keywords}. ${journal} Identify important gaps and generate 3 candidate research topics with novelty, value, feasibility, and rationale.`;
    }
    case "litreview":
      return `${upstreamContext}Conduct a literature review on: "${input.query || "the topic"}". Year range: ${input.yearFrom || "any"} to ${input.yearTo || "present"}. Max papers: ${input.maxResults || 50}. Synthesize key findings and identify research gaps.${upstreamContext ? " Use the topic context above to focus the review." : ""}`;
    case "design":
      return `${upstreamContext}Design a research study for this question: "${input.researchQuestion || "the topic"}". ${input.methodology ? `Preferred methodology: ${input.methodology}.` : ""} Include hypotheses, variables, sampling, procedure, and feasibility assessment.${upstreamContext ? " Ensure the design aligns with the identified research topic above." : ""}`;
    case "data":
      return `${upstreamContext}Help with data analysis for: "${input.dataSource || "data source"}". Collection method: ${input.collectionMethod || "to be determined"}. Provide data collection strategy, cleaning steps, and analysis recommendations.`;
    case "write":
      return `Write the "${input.section || "introduction"}" section of an academic paper. Citation style: ${input.citationStyle || "APA"}. Use IMRaD format with academic tone.`;
    case "submit":
      return `Match this paper to suitable journals. Abstract: "${input.abstract || ""}". Keywords: ${input.keywords || "none"}. Open access preference: ${input.openAccess ? "yes" : "no"}. Provide top 3 journal recommendations with fit scores.`;
    case "rebuttal":
      return `Generate point-by-point responses to these reviewer comments: "${input.reviewerComments || ""}". For each comment, provide an acknowledgment, evidence-based response, and location of changes.`;
  }
}

/** Resolve the user prompt: pack override → plugin agent → built-in assembly. */
export async function resolveUserPrompt(
  agentId: string,
  input: Record<string, unknown>,
  projectId?: string
): Promise<string> {
  const packRef = await getPackSelection(agentId);
  if (packRef && packRef !== "builtin") {
    const override = findPackOverride(packRef, agentId);
    if (override?.userPromptTemplate) {
      let prefix = "";
      const pluginAgent = getPluginAgent(agentId);
      const contextFrom =
        pluginAgent?.contextFrom ??
        (isBuiltInAgent(agentId)
          ? (await import("@/lib/ai/agents/registry")).AGENT_META[agentId].contextFrom
          : undefined);
      if (projectId && contextFrom?.length) {
        prefix = await buildAgentContext(projectId, contextFrom);
      }
      return `${prefix}${applyTemplate(override.userPromptTemplate, input)}`;
    }
  }

  const pluginAgent = getPluginAgent(agentId);
  if (pluginAgent) {
    let prefix = "";
    if (projectId && pluginAgent.contextFrom?.length) {
      prefix = await buildAgentContext(projectId, pluginAgent.contextFrom);
    }
    return `${prefix}${applyTemplate(pluginAgent.userPromptTemplate, input)}`;
  }

  if (isBuiltInAgent(agentId)) {
    return buildBuiltinUserPrompt(agentId, input, projectId);
  }

  throw new Error(`Unknown agent: ${agentId}`);
}

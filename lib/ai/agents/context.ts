/**
 * Agent Context Builder (lib/ai/agents/context.ts)
 *
 * Functionality:
 * - Builds a context string from upstream agent outputs for reuse in later prompts.
 * - Queries only the agents declared in a registry entry's `contextFrom` sources.
 * - Reads the latest approved/applied artifact per source from the backend run API.
 *
 * Notes:
 * - Best-effort: per-source failures are swallowed so the caller can proceed without context.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { listRuns } from "@/lib/client/agents";
import type { AgentContextSource } from "./registry";

/** Maps a built-in agent id to the artifact kind its graph persists. */
const AGENT_ARTIFACT_KIND: Record<string, string> = {
  topic: "topic_proposal",
  litreview: "literature_brief",
  design: "research_design",
  data: "analysis_plan",
  write: "manuscript_draft",
  submit: "journal_shortlist",
  rebuttal: "rebuttal_draft",
};

/**
 * Builds a context string from upstream agent outputs.
 * Queries only agents declared in the registry's `contextFrom` field.
 * Best-effort — silently skips if upstream data is unavailable.
 */
export async function buildAgentContext(
  projectId: string,
  sources: AgentContextSource[]
): Promise<string> {
  if (sources.length === 0) return "";

  let runs: Awaited<ReturnType<typeof listRuns>>;
  try {
    runs = await listRuns(projectId);
  } catch {
    return "";
  }

  let context = "";
  for (const source of sources) {
    try {
      const kind = AGENT_ARTIFACT_KIND[source.agent] ?? source.agent;
      for (const run of runs) {
        if (run.agent !== source.agent) continue;
        const artifact = run.artifacts.find(
          (a) => a.kind === kind && (a.status === "approved" || a.status === "applied") && a.content?.text
        );
        if (!artifact?.content.text) continue;
        const maxChars = source.maxChars ?? 1000;
        context += `\nContext from previous ${source.agent} analysis:\n${artifact.content.text.substring(0, maxChars)}\n\n`;
        break;
      }
    } catch {
      // Best-effort; proceed without context on failure
    }
  }

  return context;
}

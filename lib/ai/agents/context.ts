/**
 * Agent Context Builder (lib/ai/agents/context.ts)
 *
 * Functionality:
 * - Builds a context string from upstream agent outputs for reuse in later prompts.
 * - Queries only the agents declared in a registry entry's `contextFrom` sources.
 * - Reads the latest approved/applied run per source from Supabase (collaborative) or Dexie (local).
 * - Appends trimmed output text plus optional discipline/keywords metadata.
 *
 * Notes:
 * - Best-effort: per-source failures are swallowed so the caller can proceed without context.
 * - Collaborators: registry (AgentContextSource), localDB, supabase/collaborative, field-map.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { localDB, type LocalAgentRun } from "@/lib/local/db";
import { getCollaborativeClient, isCollaborativeMode } from "@/lib/supabase/collaborative";
import { fromRemoteRecord } from "@/lib/supabase/field-map";
import type { AgentContextSource } from "./registry";

/**
 * Builds a context string from upstream agent outputs.
 * Queries only agents declared in the registry's `contextFrom` field.
 * Best-effort — silently skips if upstream data is unavailable.
 */
export async function buildAgentContext(
  projectId: string,
  sources: AgentContextSource[]
): Promise<string> {
  let context = "";

  // Collect at most one context block per declared upstream agent.
  for (const source of sources) {
    try {
      let runs: LocalAgentRun[] = [];
      if (isCollaborativeMode()) {
        const client = getCollaborativeClient();
        if (!client) continue;
        const { data, error } = await client
          .from("agent_runs")
          .select("*")
          .eq("project_id", projectId)
          .eq("agent", source.agent)
          .in("status", ["approved", "applied"])
          .order("started_at", { ascending: false })
          .limit(1);
        if (error) {
          console.error("Supabase agent context query failed", error);
          continue;
        }
        runs = (data ?? []).map((row) => fromRemoteRecord(row as Record<string, unknown>) as unknown as LocalAgentRun);
      } else {
        runs = await localDB.agentRuns
          .where("projectId")
          .equals(projectId)
          .filter(
            (r) =>
              r.agent === source.agent &&
              (r.status === "approved" || r.status === "applied")
          )
          .reverse()
          .sortBy("startedAt");
      }

      // Use only the most recent approved/applied run for this source.
      const latest = runs[0];
      if (!latest) continue;

      const outputs = latest.outputs as Record<string, unknown> | undefined;
      if (outputs?.text && typeof outputs.text === "string") {
        const maxChars = source.maxChars ?? 1000;
        context += `\nContext from previous ${source.agent} analysis:\n${outputs.text.substring(0, maxChars)}\n`;
      }

      if (latest.inputs) {
        const inputs = latest.inputs as Record<string, unknown>;
        if (inputs.discipline)
          context += `Discipline: ${inputs.discipline}\n`;
        if (inputs.keywords)
          context += `Keywords: ${Array.isArray(inputs.keywords) ? (inputs.keywords as string[]).join(", ") : String(inputs.keywords)}\n`;
      }

      if (context) context += "\n";
    } catch {
      // Best-effort; proceed without context on failure
    }
  }

  return context;
}

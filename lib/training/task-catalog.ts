/**
 * Training Task Catalog (lib/training/task-catalog.ts)
 *
 * Functionality:
 * - Merges built-in tasks with pack-provided tasks into one catalog map.
 * - Validates/resolves task ids and expands packs into catalog definitions.
 * - Maps training tasks to agent ids and derives agents completed by training.
 *
 * Notes:
 * - Builtin definitions come from `registry.ts`; packs override by id.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { AgentId } from "@/lib/ai/agents/registry";
import { BUILTIN_AGENT_IDS } from "@/lib/ai/agents/registry";
import type { TrainingDimension } from "@/lib/local/db";
import {
  MVP_TRAINING_TASKS,
  type TrainingTaskDefinition,
  getTrainingTaskDefinition,
} from "./registry";

/** Where a catalog task definition originated. */
export type CatalogSource = "builtin" | "pack" | "remote";

/** A task definition enriched with catalog provenance. */
export interface CatalogTaskDefinition extends TrainingTaskDefinition {
  source: CatalogSource;
  packKey?: string;
  packName?: string;
  peerReview?: boolean;
}

/** Loose pack shape accepted by the catalog before full validation. */
export interface TrainingTaskPackLike {
  key: string;
  name: string;
  description?: string;
  version?: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    agent: string;
    dimension: TrainingDimension | string;
    steps: string[];
    requiresReview: boolean;
    peerReview?: boolean;
  }>;
}

// Allowed dimension slugs; unknown values fall back during expansion.
const DIMENSIONS = new Set<string>([
  "ai-literacy",
  "critical-evaluation",
  "data-governance",
  "academic-ethics",
  "collaboration",
]);

// Allowed agent ids; unknown pack agents fall back to "topic".
const AGENT_SET = new Set<string>(BUILTIN_AGENT_IDS);

/** Stable id for a pack task: packKey.taskKey */
export function packTaskId(packKey: string, taskKey: string): string {
  return `${packKey}.${taskKey}`;
}

/** True when the id matches a built-in training task. */
export function isBuiltinTaskId(taskId: string): boolean {
  return Boolean(getTrainingTaskDefinition(taskId));
}

/** Builtin slug or pack-qualified `packkey.taskkey`. */
export function isValidCatalogTaskId(taskId: string): boolean {
  return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)?$/i.test(taskId) && taskId.length <= 120;
}

/** Built-in MVP tasks tagged with the "builtin" source. */
export function listBuiltinCatalog(): CatalogTaskDefinition[] {
  return MVP_TRAINING_TASKS.map((task) => ({
    ...task,
    source: "builtin" as const,
  }));
}

/** Expand one pack's tasks into catalog definitions with qualified ids. */
export function expandPackToCatalog(pack: TrainingTaskPackLike): CatalogTaskDefinition[] {
  return pack.tasks.map((task) => {
    const id = task.id.includes(".") ? task.id : packTaskId(pack.key, task.id);
    const agent = (AGENT_SET.has(task.agent) ? task.agent : "topic") as AgentId;
    const dimension = (
      DIMENSIONS.has(task.dimension) ? task.dimension : "ai-literacy"
    ) as TrainingDimension;
    return {
      id,
      title: task.title,
      description: task.description,
      agent,
      dimension,
      steps: task.steps,
      requiresReview: Boolean(task.requiresReview),
      peerReview: Boolean(task.peerReview),
      source: "pack" as const,
      packKey: pack.key,
      packName: pack.name,
    };
  });
}

/** Merge builtin + packs; later packs override same id. */
export function buildTaskCatalog(packs: TrainingTaskPackLike[] = []): Map<string, CatalogTaskDefinition> {
  const map = new Map<string, CatalogTaskDefinition>();
  for (const task of listBuiltinCatalog()) {
    map.set(task.id, task);
  }
  for (const pack of packs) {
    for (const task of expandPackToCatalog(pack)) {
      map.set(task.id, task);
    }
  }
  return map;
}

/** Resolve a task from the catalog map, falling back to a builtin lookup. */
export function getCatalogTask(
  taskId: string,
  catalog?: Map<string, CatalogTaskDefinition>
): CatalogTaskDefinition | undefined {
  if (catalog?.has(taskId)) return catalog.get(taskId);
  const builtin = getTrainingTaskDefinition(taskId);
  if (builtin) return { ...builtin, source: "builtin" };
  return undefined;
}

/** True when the task id resolves in the catalog. */
export function catalogHasTask(
  taskId: string,
  catalog?: Map<string, CatalogTaskDefinition>
): boolean {
  return Boolean(getCatalogTask(taskId, catalog));
}

/** Agent id bound to a training task, or null when unknown. */
export function trainingTaskToAgent(
  taskId: string,
  catalog?: Map<string, CatalogTaskDefinition>
): string | null {
  return getCatalogTask(taskId, catalog)?.agent ?? null;
}

/** Agents with at least one training task in a done status (for WorkflowStepper). */
export function agentsCompletedByTraining(params: {
  taskStatuses: Array<{ taskId: string; status: string }>;
  catalog?: Map<string, CatalogTaskDefinition>;
  doneStatuses?: string[];
}): Set<string> {
  const done = new Set(params.doneStatuses ?? ["completed", "approved"]);
  const agents = new Set<string>();
  for (const row of params.taskStatuses) {
    if (!done.has(row.status)) continue;
    const agent = trainingTaskToAgent(row.taskId, params.catalog);
    if (agent) agents.add(agent);
  }
  return agents;
}

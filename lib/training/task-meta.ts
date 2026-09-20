/**
 * Task Meta (lib/training/task-meta.ts)
 *
 * Functionality:
 * - Resolves a training task title from the catalog or builtin registry.
 * - Returns the full task metadata object for an id.
 * - Lists the built-in MVP task ids in order.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { MVP_TRAINING_TASKS } from "./registry";
import { getCatalogTask, type CatalogTaskDefinition } from "./task-catalog";

// Builtin task lookup keyed by task id.
const byId = new Map(MVP_TRAINING_TASKS.map((task) => [task.id, task]));

/** Title for a task id, falling back to the id itself. */
export function trainingTaskTitle(
  taskId: string,
  catalog?: Map<string, CatalogTaskDefinition>
): string {
  return getCatalogTask(taskId, catalog)?.title ?? byId.get(taskId)?.title ?? taskId;
}

/** Full catalog or builtin definition for a task id, or undefined. */
export function trainingTaskMeta(
  taskId: string,
  catalog?: Map<string, CatalogTaskDefinition>
) {
  return getCatalogTask(taskId, catalog) ?? byId.get(taskId);
}

/** Ordered ids of the built-in MVP training tasks. */
export function listMvpTaskIds(): string[] {
  return MVP_TRAINING_TASKS.map((task) => task.id);
}

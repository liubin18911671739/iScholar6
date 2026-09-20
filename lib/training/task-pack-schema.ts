/**
 * Task Pack Schema (lib/training/task-pack-schema.ts)
 *
 * Functionality:
 * - Defines Zod schemas for v1 task packs and v2 curriculum packs.
 * - Parses raw JSON (bare, curriculum, or plugin-wrapped) into a validated v1 pack.
 * - Expands a curriculum pack into a full v1 pack from builtin task definitions.
 *
 * Notes:
 * - Builtin task ids/agents are validated against `registry.ts` / agent registry.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";
import { BUILTIN_AGENT_IDS } from "@/lib/ai/agents/registry";
import { MVP_TRAINING_TASKS } from "./registry";

// Slug schema for pack-scoped task keys.
const taskKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "task key must be a slug");

// Schema for one task embedded in a v1 pack.
const trainingTaskInPackSchema = z.object({
  id: taskKeySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4_000),
  agent: z.enum(BUILTIN_AGENT_IDS as unknown as [string, ...string[]]),
  dimension: z.enum([
    "ai-literacy",
    "critical-evaluation",
    "data-governance",
    "academic-ethics",
    "collaboration",
  ]),
  steps: z.array(z.string().min(1).max(500)).min(1).max(20),
  requiresReview: z.boolean().default(false),
  peerReview: z.boolean().optional().default(false),
});

/** Zod schema for a full v1 task pack. */
export const trainingTaskPackSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  key: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,31}$/, "pack key must be a short lowercase slug"),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4_000).optional(),
  version: z.string().trim().min(1).max(40).default("1.0.0"),
  tasks: z.array(trainingTaskInPackSchema).min(1).max(40),
});

/** P4: curriculum-style pack that references built-in task ids only. */
export const trainingCurriculumPackSchema = z.object({
  schemaVersion: z.literal(2),
  key: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,31}$/, "pack key must be a short lowercase slug"),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4_000).optional(),
  version: z.string().trim().min(1).max(40).default("1.0.0"),
  tasks: z
    .array(
      z.object({
        taskId: taskKeySchema,
        required: z.boolean().default(true),
        dueOffsetDays: z.number().int().min(0).max(365).optional(),
      })
    )
    .min(1)
    .max(40),
});

/** Inferred input type for a validated v1 task pack. */
export type TrainingTaskPackInput = z.infer<typeof trainingTaskPackSchema>;
/** Inferred input type for a validated v2 curriculum pack. */
export type TrainingCurriculumPackInput = z.infer<
  typeof trainingCurriculumPackSchema
>;

// Builtin task ids accepted by curriculum packs.
const BUILTIN_IDS = new Set(MVP_TRAINING_TASKS.map((t) => t.id));

/**
 * Expand schemaVersion 2 curriculum pack into a full v1 pack payload
 * by resolving built-in MVP definitions.
 */
export function expandCurriculumPack(
  pack: TrainingCurriculumPackInput
):
  | { ok: true; pack: TrainingTaskPackInput }
  | { ok: false; error: string; issues?: Array<{ path: string; message: string }> } {
  const tasks: TrainingTaskPackInput["tasks"] = [];
  const seen = new Set<string>();
  for (const row of pack.tasks) {
    if (!BUILTIN_IDS.has(row.taskId)) {
      return {
        ok: false,
        error: "UNKNOWN_TASK_ID",
        issues: [{ path: "tasks", message: row.taskId }],
      };
    }
    if (seen.has(row.taskId)) {
      return {
        ok: false,
        error: "DUPLICATE_TASK_ID",
        issues: [{ path: "tasks", message: row.taskId }],
      };
    }
    seen.add(row.taskId);
    const def = MVP_TRAINING_TASKS.find((t) => t.id === row.taskId)!;
    tasks.push({
      id: def.id,
      title: def.title,
      description: def.description,
      agent: def.agent,
      dimension: def.dimension,
      steps: def.steps,
      requiresReview: def.requiresReview,
      peerReview: false,
    });
  }
  return {
    ok: true,
    pack: {
      schemaVersion: 1,
      key: pack.key,
      name: pack.name,
      description: pack.description,
      version: pack.version,
      tasks,
    },
  };
}

/** Accept bare pack, curriculum v2, or plugin wrapper `{ trainingTaskPacks: [pack] }`. */
export function parseTrainingTaskPackJson(raw: unknown):
  | { ok: true; pack: TrainingTaskPackInput }
  | { ok: false; error: string; issues?: Array<{ path: string; message: string }> } {
  let candidate = raw;
  if (raw && typeof raw === "object" && "trainingTaskPacks" in raw) {
    const packs = (raw as { trainingTaskPacks: unknown }).trainingTaskPacks;
    if (!Array.isArray(packs) || packs.length === 0) {
      return { ok: false, error: "EMPTY_PACKS" };
    }
    candidate = packs[0];
  }

  if (
    candidate &&
    typeof candidate === "object" &&
    (candidate as { schemaVersion?: number }).schemaVersion === 2
  ) {
    const v2 = trainingCurriculumPackSchema.safeParse(candidate);
    if (!v2.success) {
      return {
        ok: false,
        error: "VALIDATION_ERROR",
        issues: v2.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      };
    }
    return expandCurriculumPack(v2.data);
  }

  const parsed = trainingTaskPackSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: "VALIDATION_ERROR",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  const ids = new Set<string>();
  for (const task of parsed.data.tasks) {
    if (ids.has(task.id)) {
      return {
        ok: false,
        error: "DUPLICATE_TASK_ID",
        issues: [{ path: "tasks", message: task.id }],
      };
    }
    ids.add(task.id);
  }
  return { ok: true, pack: parsed.data };
}

/** Build a v2 curriculum pack JSON from ordered built-in task ids. */
export function buildCurriculumPackJson(input: {
  key: string;
  name: string;
  taskIds: string[];
}): TrainingCurriculumPackInput {
  return {
    schemaVersion: 2,
    key: input.key,
    name: input.name,
    version: "1.0.0",
    tasks: input.taskIds.map((taskId) => ({ taskId, required: true })),
  };
}

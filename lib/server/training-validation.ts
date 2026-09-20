/**
 * Training Validation (lib/server/training-validation.ts)
 *
 * Functionality:
 * - Defines Zod schemas for training submissions, reviews, members, programs, and tasks.
 * - Exports inferred input types plus a normalized `validationError` helper.
 * - Maps camelCase program input into snake_case database columns.
 *
 * Notes:
 * - Used by training API routes to validate request bodies before persistence.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";

// Free-form answer map with bounded field count and value length.
const answersSchema = z
  .record(z.string().min(1).max(64), z.string().max(20_000))
  .refine((answers) => Object.keys(answers).length <= 20, "too many answer fields");

/** Camp submit consent proof — required when status is submitted. */
export const trainingConsentProofSchema = z.object({
  consentId: z.string().min(1).max(120),
  consentedAt: z.string().min(1),
  externalServices: z.array(z.string().min(1).max(80)).min(1).max(10),
  redactionConfirmed: z.literal(true),
});

/** Camp task submission payload (draft or submitted, with optional consent proof). */
export const trainingSubmissionSchema = z.object({
  programId: z.string().uuid("programId must be a UUID"),
  taskId: z
    .string()
    .min(1)
    .max(120)
    .regex(
      /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)?$/i,
      "taskId must be a slug or pack.task slug"
    ),
  answers: answersSchema,
  reflection: z.string().max(20_000).optional().nullable(),
  status: z.enum(["in_progress", "submitted"]),
  /** Required for status=submitted — camp redaction audit trail. */
  consentProof: trainingConsentProofSchema.optional(),
});

/** Peer-review decision payload for a submission assignment. */
export const trainingPeerReviewSchema = z.object({
  assignmentId: z.string().uuid(),
  decision: z.enum(["approved", "needs_revision"]),
  feedback: z.string().max(10_000).optional().nullable(),
  score: z.number().int().min(0).max(100).optional().nullable(),
  evidenceCardIds: z.array(z.string().min(1).max(80)).max(20).optional().default([]),
});

// Optional `YYYY-MM-DD` date string.
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .optional()
  .nullable();

/** Lifecycle status values for a training program. */
export const trainingProgramStatusSchema = z.enum(["draft", "active", "archived"]);

// Base program fields before partial/refine wrappers are applied.
const trainingProgramObjectSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200, "name is too long"),
  description: z.string().trim().max(2_000).optional().nullable(),
  discipline: z.string().trim().min(1).max(120).optional().nullable(),
  cohortName: z.string().trim().max(200).optional().nullable(),
  startDate: optionalDate,
  endDate: optionalDate,
  maxMembers: z.number().int().min(1).max(10_000).optional().nullable(),
  status: trainingProgramStatusSchema.optional(),
  /** Tenant / department id (required for new camps when multi-tenant is active). */
  organizationId: z.string().uuid().optional().nullable(),
});

// Shared refinement ensuring endDate is not before startDate.
function refineProgramDates<T extends { startDate?: string | null; endDate?: string | null }>(
  value: T,
  ctx: z.RefinementCtx
) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "endDate must be on or after startDate",
    });
  }
}

/** Create/update schema for a training program. */
export const trainingProgramSchema = trainingProgramObjectSchema.superRefine(refineProgramDates);

/** Partial program schema requiring at least one field. */
export const trainingProgramPatchSchema = trainingProgramObjectSchema
  .partial()
  .superRefine(refineProgramDates)
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field required",
  });

/** Single member invite payload. */
export const trainingMemberInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("valid email required").max(320),
  role: z.enum(["learner", "ta"]).optional().default("learner"),
});

/** Batch member invite payload (up to 200 emails). */
export const trainingMemberBatchSchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().email().max(320))
    .min(1)
    .max(200),
  role: z.enum(["learner", "ta"]).optional().default("learner"),
});

/** Member patch requiring a status and/or role change. */
export const trainingMemberPatchSchema = z
  .object({
    status: z.enum(["active", "completed", "removed"]).optional(),
    role: z.enum(["learner", "ta"]).optional(),
  })
  .refine((value) => value.status != null || value.role != null, {
    message: "status or role required",
  });

/** Reviewer decision payload with optional feedback, score, and rubric. */
export const trainingReviewSchema = z.object({
  submissionId: z.string().uuid("submissionId must be a UUID"),
  decision: z.enum(["approved", "needs_revision", "escalated"]),
  feedback: z.string().max(20_000).optional().nullable(),
  score: z.number().int().min(0).max(100).optional().nullable(),
  /** Optional simple rubric scores 1–5 by dimension key. */
  rubric: z.record(z.string().max(64), z.number().int().min(1).max(5)).optional().nullable(),
});

/** Payload for claiming or releasing a submission. */
export const trainingClaimSchema = z.object({
  submissionId: z.string().uuid("submissionId must be a UUID"),
  claim: z.boolean(),
});

/** Builtin slug or pack-qualified `packkey.taskkey`. */
export const trainingProgramTaskItemSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .max(120)
    .regex(
      /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)?$/i,
      "taskId must be a slug or pack.task slug"
    ),
  ordinal: z.number().int().min(0).max(1000).optional().default(0),
  dueAt: z.string().datetime().optional().nullable(),
  required: z.boolean().optional().default(true),
  requiresReviewOverride: z.boolean().optional().nullable(),
});

/** Payload replacing a program's task list (up to 50 tasks). */
export const trainingProgramTasksPutSchema = z.object({
  tasks: z.array(trainingProgramTaskItemSchema).max(50),
});

/** Inferred input type for the tasks PUT schema. */
export type TrainingProgramTasksPutInput = z.infer<typeof trainingProgramTasksPutSchema>;

/** Inferred input type for camp submissions. */
export type TrainingSubmissionInput = z.infer<typeof trainingSubmissionSchema>;
/** Inferred input type for program create/update. */
export type TrainingProgramInput = z.infer<typeof trainingProgramSchema>;
/** Inferred input type for partial program patches. */
export type TrainingProgramPatchInput = z.infer<typeof trainingProgramPatchSchema>;
/** Inferred input type for single member invites. */
export type TrainingMemberInviteInput = z.infer<typeof trainingMemberInviteSchema>;
/** Inferred input type for batch member invites. */
export type TrainingMemberBatchInput = z.infer<typeof trainingMemberBatchSchema>;
/** Inferred input type for member patches. */
export type TrainingMemberPatchInput = z.infer<typeof trainingMemberPatchSchema>;
/** Inferred input type for reviewer decisions. */
export type TrainingReviewInput = z.infer<typeof trainingReviewSchema>;

/** Normalize a Zod error into a structured `VALIDATION_ERROR` response. */
export function validationError(error: z.ZodError) {
  return {
    ok: false as const,
    error: "VALIDATION_ERROR",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

/** Map camelCase program input to snake_case DB columns. */
export function programRowFromInput(
  input: TrainingProgramInput | TrainingProgramPatchInput,
  extras?: { owner_id?: string; updated_at?: string }
) {
  const row: Record<string, unknown> = { ...extras };
  if ("name" in input && input.name !== undefined) row.name = input.name;
  if ("description" in input && input.description !== undefined) {
    row.description = input.description ?? null;
  }
  if ("discipline" in input && input.discipline !== undefined) {
    row.discipline = input.discipline ?? null;
  }
  if ("cohortName" in input && input.cohortName !== undefined) {
    row.cohort_name = input.cohortName ?? null;
  }
  if ("startDate" in input && input.startDate !== undefined) {
    row.start_date = input.startDate ?? null;
  }
  if ("endDate" in input && input.endDate !== undefined) {
    row.end_date = input.endDate ?? null;
  }
  if ("maxMembers" in input && input.maxMembers !== undefined) {
    row.max_members = input.maxMembers ?? null;
  }
  if ("status" in input && input.status !== undefined) {
    row.status = input.status;
  }
  if ("organizationId" in input && input.organizationId !== undefined) {
    row.organization_id = input.organizationId ?? null;
  }
  return row;
}

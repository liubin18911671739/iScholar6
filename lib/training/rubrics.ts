/**
 * Rubric Preview (lib/training/rubrics.ts)
 *
 * Functionality:
 * - Defines default rubric weights for steps, reflection, evidence, and review.
 * - `previewRubric` estimates a score before submission using `scoreSubmission`.
 * - Reports completion flags and evidence ratio for UI feedback.
 *
 * Notes:
 * - Pure helper; delegates scoring to `scoring.ts`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { TypedStepDef } from "./step-types";
import { typedStepsComplete } from "./step-types";
import { scoreSubmission } from "./scoring";
import type {
  LocalEvidenceCard,
  LocalTrainingReview,
  LocalTrainingSubmission,
} from "@/lib/local/db";

/** Default contribution weights (sum to 100) for the training rubric. */
export const DEFAULT_RUBRIC_WEIGHTS = {
  steps: 60,
  reflection: 15,
  evidence: 15,
  review: 10,
} as const;

/** Previewed rubric outcome shown before a learner submits. */
export interface RubricPreview {
  weights: typeof DEFAULT_RUBRIC_WEIGHTS;
  estimated: number;
  stepsOk: boolean;
  reflectionOk: boolean;
  evidenceRatio: number;
  reviewPending: boolean;
}

/** Estimate the rubric score and completion flags for an in-progress submission. */
export function previewRubric(input: {
  answers: Record<string, string>;
  steps: TypedStepDef[];
  reflection: string;
  evidence: LocalEvidenceCard[];
  review?: LocalTrainingReview | null;
  /** When false, evidence weight shows 0 contribution */
  requiresReview: boolean;
}): RubricPreview {
  const stepsOk = typedStepsComplete(input.answers, input.steps);
  const reflectionOk = input.reflection.trim().length > 0;
  const evidence = input.evidence ?? [];
  const evidenceRatio = evidence.length
    ? evidence.filter((e) => e.verificationStatus === "verified").length /
      evidence.length
    : 0;

  // Approximate without full LocalTrainingSubmission shape
  const mockSubmission = {
    answers: input.answers,
    reflection: input.reflection,
  } as LocalTrainingSubmission;

  const estimated = scoreSubmission(
    mockSubmission,
    input.steps.length,
    evidence,
    input.review ?? undefined
  );

  return {
    weights: DEFAULT_RUBRIC_WEIGHTS,
    estimated,
    stepsOk,
    reflectionOk,
    evidenceRatio,
    reviewPending: input.requiresReview && !input.review,
  };
}

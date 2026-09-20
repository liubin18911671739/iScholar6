/**
 * Pure helpers for training step completion and submit checklist (P0+).
 *
 * Functionality:
 * - Checks individual and aggregate step completion against min-character rules.
 * - Builds a required/optional submit checklist (`buildSubmitChecklist`).
 * - Gates submission via `canSubmitFromChecklist`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** One checklist row with required/ok flags. */
export interface SubmitChecklistItem {
  id: "steps" | "reflection" | "sensitive" | "evidence";
  ok: boolean;
  /** When false, blocks submit. Soft hints set required=false. */
  required: boolean;
}

/** True when the trimmed answer meets the effective minimum length. */
export function isStepComplete(
  answer: string | undefined | null,
  minChars = 1
): boolean {
  return (answer ?? "").trim().length >= Math.max(1, minChars);
}

/** Count index-keyed answers that meet their per-step minimums. */
export function countCompletedSteps(
  answers: Record<string, string>,
  stepCount: number,
  minCharsByStep?: Array<number | undefined>
): number {
  let n = 0;
  for (let i = 0; i < stepCount; i++) {
    const min = minCharsByStep?.[i] ?? 1;
    if (isStepComplete(answers[String(i)], min)) n += 1;
  }
  return n;
}

/** True when every index-keyed step is complete. */
export function allStepsComplete(
  answers: Record<string, string>,
  stepCount: number,
  minCharsByStep?: Array<number | undefined>
): boolean {
  return countCompletedSteps(answers, stepCount, minCharsByStep) >= stepCount;
}

/** Assemble step/reflection/sensitive/evidence checklist items for submission. */
export function buildSubmitChecklist(input: {
  answers: Record<string, string>;
  stepCount: number;
  minCharsByStep?: Array<number | undefined>;
  /** When provided, overrides index-based step check (typed tasks). */
  stepAnswersComplete?: boolean;
  reflection: string;
  hasSensitive: boolean;
  evidenceCount?: number;
  /** Soft hint unless requireEvidence */
  requireEvidence?: boolean;
}): SubmitChecklistItem[] {
  const stepsOk =
    input.stepAnswersComplete ??
    allStepsComplete(input.answers, input.stepCount, input.minCharsByStep);

  const items: SubmitChecklistItem[] = [
    { id: "steps", ok: stepsOk, required: true },
    {
      id: "reflection",
      ok: input.reflection.trim().length >= 1,
      required: true,
    },
    {
      id: "sensitive",
      ok: !input.hasSensitive,
      required: true,
    },
  ];

  if (input.requireEvidence) {
    items.push({
      id: "evidence",
      ok: (input.evidenceCount ?? 0) >= 1,
      required: true,
    });
  } else if (input.evidenceCount !== undefined) {
    items.push({
      id: "evidence",
      ok: (input.evidenceCount ?? 0) >= 1,
      required: false,
    });
  }

  return items;
}

/** True when no required checklist item is failing. */
export function canSubmitFromChecklist(items: SubmitChecklistItem[]): boolean {
  return items.filter((i) => i.required).every((i) => i.ok);
}

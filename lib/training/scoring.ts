/**
 * Training Scoring (lib/training/scoring.ts)
 *
 * Functionality:
 * - Lists the five training dimensions with localized labels.
 * - Scores a submission from step completion, reflection, evidence, and review.
 * - Aggregates dimension and class-level average scores.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { LocalEvidenceCard, LocalTrainingReview, LocalTrainingSubmission, TrainingDimension } from "@/lib/local/db";

/** The five training dimensions with their Chinese display labels. */
export const TRAINING_DIMENSIONS: Array<{ id: TrainingDimension; label: string }> = [
  { id: "ai-literacy", label: "AI工具应用" },
  { id: "critical-evaluation", label: "信息批判评估" },
  { id: "data-governance", label: "数据管理与开放科学" },
  { id: "academic-ethics", label: "学术伦理与负责任AI" },
  { id: "collaboration", label: "协作与创新" },
];

/** Weighted 0–100 score for a submission (steps 60, reflection 15, evidence 15, review 10). */
export function scoreSubmission(
  submission: LocalTrainingSubmission | undefined,
  stepCount: number,
  evidence: LocalEvidenceCard[] = [],
  review?: LocalTrainingReview
) {
  if (!submission) return 0;
  // Ignore internal keys (e.g. __agentRunIds) and empty strings
  const answerValues = Object.entries(submission.answers)
    .filter(([k, v]) => !k.startsWith("__") && typeof v === "string" && v.trim())
    .map(([, v]) => v);
  const completed = Math.min(answerValues.length, Math.max(stepCount, 1));
  const reflection = submission.reflection?.trim() ? 1 : 0;
  const completionScore = (completed / Math.max(stepCount, 1)) * 60;
  const reflectionScore = reflection * 15;
  const evidenceScore = evidence.length
    ? (evidence.filter((card) => card.verificationStatus === "verified").length / evidence.length) * 15
    : 0;
  const reviewScore = review?.score == null ? 0 : Math.min(Math.max(review.score, 0), 100) * 0.1;
  return Math.round(Math.min(100, completionScore + reflectionScore + evidenceScore + reviewScore));
}

/** Average submission score per training dimension. */
export function buildDimensionReport(
  submissions: Array<{ submission?: LocalTrainingSubmission; dimension: TrainingDimension; stepCount: number }>
) {
  return Object.fromEntries(TRAINING_DIMENSIONS.map(({ id }) => {
    const rows = submissions.filter((item) => item.dimension === id);
    const score = rows.length ? Math.round(rows.reduce((sum, row) => sum + scoreSubmission(row.submission, row.stepCount), 0) / rows.length) : 0;
    return [id, score];
  })) as Record<TrainingDimension, number>;
}

/** One member's dimension scores and overall average. */
export interface TrainingClassMemberReport {
  learnerId: string;
  displayName?: string;
  scores: Record<TrainingDimension, number>;
  overall: number;
}

/** Class averages across each dimension plus the overall average. */
export function buildClassReport(members: TrainingClassMemberReport[]) {
  return {
    memberCount: members.length,
    dimensions: Object.fromEntries(TRAINING_DIMENSIONS.map(({ id }) => [
      id,
      members.length ? Math.round(members.reduce((sum, member) => sum + member.scores[id], 0) / members.length) : 0,
    ])) as Record<TrainingDimension, number>,
    overall: members.length ? Math.round(members.reduce((sum, member) => sum + member.overall, 0) / members.length) : 0,
  };
}

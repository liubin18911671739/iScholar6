/**
 * Training Review Queue (/training/review)
 *
 * Functionality:
 * - Renders the ReviewQueue client component for reviewing learner submissions.
 * - Delegates submission loading, scoring, feedback, and persistence to that component.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { ReviewQueue } from "@/components/training/review-queue";

/** Route entry that renders the training review queue. */
export default function TrainingReviewPage() { return <ReviewQueue />; }

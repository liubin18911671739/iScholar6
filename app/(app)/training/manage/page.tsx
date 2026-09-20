/**
 * Training Management (/training/manage)
 *
 * Functionality:
 * - Renders the TrainingManagePage client component for program and enrollment administration.
 * - Delegates programs, learners, task packs, reports, and consent tooling to that component.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { TrainingManagePage } from "@/components/training/manage-page";

/** Route entry that renders the training management workspace. */
export default function Page() {
  return <TrainingManagePage />;
}

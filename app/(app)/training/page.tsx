/**
 * Training Hub Page (/training)
 *
 * Functionality:
 * - Server entry point for the learner-facing training camp hub.
 * - Renders no data itself; delegates the whole workspace to the client
 *   component MvpTraining (tasks, submissions, peer review, coach view).
 *
 * Notes:
 * - Requires the authenticated app layout (app/(app)/layout.tsx) which gates
 *   unauthenticated visitors to /login.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { MvpTraining } from "@/components/training/mvp-training";

/** Route component that mounts the learner training workspace. */
export default function TrainingPage() {
  return <MvpTraining />;
}

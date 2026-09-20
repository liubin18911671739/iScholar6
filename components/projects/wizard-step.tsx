/**
 * Wizard Step (components/projects/wizard-step.tsx)
 *
 * Functionality:
 * - Wraps wizard step content with a fade/slide entrance animation.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import type { ReactNode } from "react";

/** Props for a single wizard step container. */
interface WizardStepProps {
  children: ReactNode;
}

/** Animated container for a single wizard step's content. */
export function WizardStep({ children }: WizardStepProps) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-right-4 duration-300">
      {children}
    </div>
  );
}

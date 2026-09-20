/**
 * Training Analytics Dashboard (/training/analytics)
 *
 * Functionality:
 * - Renders the TrainingAnalyticsDashboard client component for training admins.
 * - Delegates data loading, charts, filters, and exports entirely to the dashboard component.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { TrainingAnalyticsDashboard } from "@/components/training/analytics-dashboard";

/** Route entry that renders the training analytics dashboard. */
export default function Page() {
  return <TrainingAnalyticsDashboard />;
}

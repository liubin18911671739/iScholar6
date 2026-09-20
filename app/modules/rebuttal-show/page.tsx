/**
 * Legacy Rebuttal Show (modules/rebuttal-show)
 *
 * Functionality:
 * - Compatibility route for links from the pre-project module URLs.
 * - Immediately redirects visitors to the projects index.
 *
 * Notes:
 * - Uses next/navigation's redirect during server rendering.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { redirect } from "next/navigation";

/** Compatibility entry point for links from the pre-project module routes. */
export default function LegacyRebuttalShowPage() {
  redirect("/projects");
}

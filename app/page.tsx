/**
 * Landing Page (/)
 *
 * Functionality:
 * - Server component entry point for the public root route.
 * - Renders the client-side LandingClient marketing page.
 *
 * Notes:
 * - All landing markup and interactivity live in @/components/landing-client.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { LandingClient } from "@/components/landing-client";

/** Renders the public landing experience by delegating to the client component. */
export default function LandingPage() {
  return <LandingClient />;
}

/**
 * Theme Provider (components/providers/theme-provider.tsx)
 *
 * Functionality:
 * - Injects an inline script that sets `data-theme="dark"` before hydration to prevent a light flash.
 * - Renders its children unchanged.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import type { ReactNode } from "react";

// ── Flash prevention: set dark theme before hydration ──
const FLASH_SCRIPT = `(function(){document.documentElement.setAttribute("data-theme","dark");})()`;

/** Props for the theme provider. */
interface Props {
  children: ReactNode;
}

/** Applies the dark theme before hydration and renders children. */
export function ThemeProvider({ children }: Props) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: FLASH_SCRIPT }}
      />
      {children}
    </>
  );
}

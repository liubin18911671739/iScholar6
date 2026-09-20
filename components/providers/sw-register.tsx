/**
 * Service Worker Register (components/providers/sw-register.tsx)
 *
 * Functionality:
 * - Registers the `/sw.js` service worker once on mount when the browser supports it.
 * - Treats registration as best-effort and renders nothing.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useEffect } from "react";

/** Client-only component that registers the app service worker. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration is best-effort; app works without it
      });
    }
  }, []);
  return null;
}

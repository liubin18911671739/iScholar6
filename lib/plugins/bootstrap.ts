/**
 * Plugin Bootstrap (lib/plugins/bootstrap.ts)
 *
 * Functionality:
 * - Provides an idempotent, client-only bootstrap that loads installed plugins into the runtime registry.
 * - Skips work on the server and when the plugin system flag is disabled.
 * - Exposes a test helper to reset the bootstrap guard.
 *
 * Side effects:
 * - Reads installs from Dexie via `./install` and mutates the in-memory plugin registry.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { isPluginSystemEnabled } from "./flags";
import { bootstrapPlugins } from "./install";

// Module-level guard so bootstrap runs at most once per client session.
let bootstrapped = false;

/** Idempotent client bootstrap: load Dexie installs into runtime registry. */
export async function ensurePluginsBootstrapped(): Promise<void> {
  if (bootstrapped) return;
  if (typeof window === "undefined") return;
  if (!isPluginSystemEnabled()) {
    bootstrapped = true;
    return;
  }
  try {
    await bootstrapPlugins();
  } catch (e) {
    console.error("[plugins] bootstrap failed", e);
  } finally {
    bootstrapped = true;
  }
}

/** Test helper. */
export function __resetPluginBootstrapForTests(): void {
  bootstrapped = false;
}

/**
 * Plugin system feature flag (lib/plugins/flags.ts)
 *
 * Functionality:
 * - Reports whether the plugin system is enabled for UI and dynamic routes.
 * - Defaults to ON; set `NEXT_PUBLIC_PLUGIN_SYSTEM=false` to disable.
 * - Core library still loads for tests when the flag is off; callers should gate UI.
 *
 * Notes:
 * - Reads `process.env.NEXT_PUBLIC_PLUGIN_SYSTEM`, so it is safe for client callers.
 *
 * @author mrpi
 * @date 2026-09-16
 */

export function isPluginSystemEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PLUGIN_SYSTEM !== "false";
}

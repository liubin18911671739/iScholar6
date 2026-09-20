/**
 * Locale Store (lib/stores/locale-store.ts)
 *
 * Functionality:
 * - Backward-compatible re-export.
 * - Points legacy consumers at the canonical store in `@/lib/stores` (slices pattern).
 * - Re-exports locale and agent-language types under legacy names.
 *
 * Notes:
 * - Kept only so existing imports don't break; prefer `@/lib/stores` in new code.
 *
 * @author mrpi
 * @date 2026-09-16
 */

export { useAppStore as useLocaleStore } from "./index";
export type { LocaleSlice as LocaleState, AgentLanguage } from "./slices/locale-slice";

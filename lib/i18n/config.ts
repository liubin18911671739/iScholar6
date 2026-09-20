/**
 * i18n Config (lib/i18n/config.ts)
 *
 * Functionality:
 * - Declares the supported locale identifiers and the default locale.
 * - Provides the `Locale` union type consumed by message loading and stores.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Locales the app ships messages for. */
export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const;
/** Union of supported locale identifiers. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];
/** Fallback locale when none is resolved. */
export const DEFAULT_LOCALE: Locale = "zh-CN";

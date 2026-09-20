/**
 * Locale Slice (lib/stores/slices/locale-slice.ts)
 *
 * Functionality:
 * - Defines locale and agent-language state for the Zustand app store.
 * - Provides setters for the UI locale and the agent response language.
 * - Initializes locale from the shared i18n default.
 *
 * Notes:
 * - Consumed by `lib/stores/index.ts` when composing the app store.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { StateCreator } from "zustand";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/** Language mode for agent responses: follow UI, or force zh/en. */
export type AgentLanguage = "auto" | "zh" | "en";

/** Locale state and setters contributed to the app store. */
export interface LocaleSlice {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  agentLanguage: AgentLanguage;
  setAgentLanguage: (lang: AgentLanguage) => void;
}

/** Create the locale slice with default locale and agent language. */
export const createLocaleSlice: StateCreator<LocaleSlice> = (set) => ({
  locale: DEFAULT_LOCALE,
  setLocale: (locale) => set({ locale }),
  agentLanguage: "auto" as AgentLanguage,
  setAgentLanguage: (agentLanguage) => set({ agentLanguage }),
});

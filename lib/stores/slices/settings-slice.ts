/**
 * Settings Slice (lib/stores/slices/settings-slice.ts)
 *
 * Functionality:
 * - Defines theme and store-version state for the Zustand app store.
 * - Provides a setter for the current theme.
 *
 * Notes:
 * - Consumed by `lib/stores/index.ts`; currently only the `dark` theme is supported.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { StateCreator } from "zustand";

/** Supported UI themes (currently only dark). */
export type Theme = "dark";

/** Settings state and setters contributed to the app store. */
export interface SettingsSlice {
  _version: number;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/** Create the settings slice with the default theme and version. */
export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  _version: 1,
  theme: "dark",
  setTheme: (theme: Theme) => set({ theme }),
});

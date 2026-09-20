/**
 * Stores Index (lib/stores/index.ts)
 *
 * Functionality:
 * - Creates the persisted Zustand app store by composing locale and settings slices.
 * - Exposes the `AppStore` union type and the `useAppStore` hook.
 *
 * Notes:
 * - Persists to localStorage under the `ischolar-locale` key via `zustand/middleware`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createLocaleSlice, type LocaleSlice } from "./slices/locale-slice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settings-slice";

/** Combined app store state from all slices. */
export type AppStore = LocaleSlice & SettingsSlice;

/** Persisted Zustand hook exposing the composed app store. */
export const useAppStore = create<AppStore>()(
  persist(
    (...args) => ({
      ...createLocaleSlice(...args),
      ...createSettingsSlice(...args),
    }),
    { name: "ischolar-locale" }
  )
);

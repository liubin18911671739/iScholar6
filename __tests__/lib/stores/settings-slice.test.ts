import { describe, it, expect } from "vitest";
import { createSettingsSlice } from "@/lib/stores/slices/settings-slice";
import type { SettingsSlice } from "@/lib/stores/slices/settings-slice";

// Zustand's StateCreator receives set, get, and store — we only need set for testing
type SetFn = (partial: Partial<SettingsSlice> | ((state: SettingsSlice) => Partial<SettingsSlice>)) => void;

function createStore() {
  let state: SettingsSlice = {} as SettingsSlice;
  const set: SetFn = (partial) => {
    if (typeof partial === "function") {
      state = { ...state, ...partial(state) };
    } else {
      state = { ...state, ...partial };
    }
  };
  const get = () => state;
  const store = { setState: set, getState: get, subscribe: () => () => {}, destroy: () => {} } as any;
  return { slice: createSettingsSlice(set, get, store), getState: () => state };
}

describe("SettingsSlice", () => {
  describe("defaults", () => {
    it("has _version 1", () => {
      const { slice } = createStore();
      expect(slice._version).toBe(1);
    });

    it("defaults theme to dark", () => {
      const { slice } = createStore();
      expect(slice.theme).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("updates theme to dark", () => {
      const { slice, getState } = createStore();
      slice.setTheme("dark");
      expect(getState().theme).toBe("dark");
    });
  });
});

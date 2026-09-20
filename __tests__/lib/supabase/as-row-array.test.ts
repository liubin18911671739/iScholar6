import { describe, expect, it } from "vitest";
import { asRowArray, asRowArrayOrEmpty } from "@/lib/supabase/remote-query";

describe("asRowArray", () => {
  it("keeps arrays", () => {
    expect(asRowArray([{ id: "1" }])).toEqual([{ id: "1" }]);
  });

  it("returns undefined for nullish (loading)", () => {
    expect(asRowArray(undefined)).toBeUndefined();
    expect(asRowArray(null)).toBeUndefined();
  });

  it("wraps a single object row with id", () => {
    expect(asRowArray({ id: "1", name: "P" })).toEqual([{ id: "1", name: "P" }]);
  });

  it("unwraps nested { data: T[] }", () => {
    expect(asRowArray({ data: [{ id: "1" }], error: null })).toEqual([{ id: "1" }]);
  });

  it("returns empty list for query-shaped objects without rows", () => {
    expect(asRowArray({ data: undefined, error: null, refetch: () => {} })).toEqual([]);
  });

  it("coerces non-objects to empty list", () => {
    expect(asRowArray("oops")).toEqual([]);
    expect(asRowArray(42)).toEqual([]);
  });

  it("asRowArrayOrEmpty never returns undefined", () => {
    expect(asRowArrayOrEmpty(undefined)).toEqual([]);
    expect(asRowArrayOrEmpty([{ id: "1" }])).toEqual([{ id: "1" }]);
  });
});

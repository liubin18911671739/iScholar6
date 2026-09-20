import { describe, it, expect } from "vitest";
import { cosineSimilarity, embeddingToArrayBuffer, clearEmbeddingCache } from "@/lib/local/vector";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("returns -1.0 for opposite vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("returns 0.0 for zero vectors", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0.0);
  });

  it("returns correct value for arbitrary vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    // dot = 1*4 + 2*5 + 3*6 = 32
    // |a| = sqrt(14), |b| = sqrt(77)
    // cos = 32 / sqrt(14*77) = 32 / sqrt(1078) ≈ 0.9746
    const expected = 32 / Math.sqrt(14 * 77);
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });

  it("handles different vector dimensions correctly", () => {
    const a = new Float32Array([1, 1]);
    const b = new Float32Array([1, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });
});

describe("embeddingToArrayBuffer", () => {
  it("round-trips Float32Array data", () => {
    const original = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const buffer = embeddingToArrayBuffer(original);
    const restored = new Float32Array(buffer);
    expect(restored).toEqual(original);
  });

  it("returns ArrayBuffer type", () => {
    const embedding = new Float32Array([1, 2, 3]);
    const buffer = embeddingToArrayBuffer(embedding);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe("clearEmbeddingCache", () => {
  it("does not throw", () => {
    expect(() => clearEmbeddingCache()).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { AGENT_IDS, AGENT_META, isValidAgent, type AgentId } from "@/lib/ai/agents/registry";

describe("AGENT_IDS", () => {
  it("has exactly 7 entries", () => {
    expect(AGENT_IDS).toHaveLength(7);
  });

  it("contains all expected agent IDs", () => {
    expect(AGENT_IDS).toEqual([
      "topic",
      "litreview",
      "design",
      "data",
      "write",
      "submit",
      "rebuttal",
    ]);
  });
});

describe("AGENT_META", () => {
  it("has an entry for each AGENT_IDS value", () => {
    for (const id of AGENT_IDS) {
      expect(AGENT_META[id]).toBeDefined();
    }
  });

  it("each entry has non-empty name and description", () => {
    for (const id of AGENT_IDS) {
      expect(AGENT_META[id].name.length).toBeGreaterThan(0);
      expect(AGENT_META[id].description.length).toBeGreaterThan(0);
    }
  });
});

describe("isValidAgent", () => {
  it("returns true for all valid agent IDs", () => {
    for (const id of AGENT_IDS) {
      expect(isValidAgent(id)).toBe(true);
    }
  });

  it("returns false for invalid strings", () => {
    expect(isValidAgent("unknown")).toBe(false);
    expect(isValidAgent("")).toBe(false);
    expect(isValidAgent("Topic")).toBe(false);
    expect(isValidAgent("topic ")).toBe(false);
  });

  it("narrows the type to AgentId when true", () => {
    const id = "topic";
    if (isValidAgent(id)) {
      // TypeScript should infer id as AgentId here
      const _meta = AGENT_META[id];
      expect(_meta).toBeDefined();
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  isAgentPathAllowed,
  isPluginAgentId,
  isValidPluginId,
  parsePluginAgentId,
  toPluginAgentId,
} from "@/lib/plugins/ids";

describe("plugin ids", () => {
  it("builds and parses plugin agent ids", () => {
    const id = toPluginAgentId("ethics-kit", "irb-assist");
    expect(id).toBe("p.ethics-kit.irb-assist");
    expect(isPluginAgentId(id)).toBe(true);
    expect(parsePluginAgentId(id)).toEqual({
      pluginId: "ethics-kit",
      key: "irb-assist",
    });
  });

  it("validates plugin id slugs", () => {
    expect(isValidPluginId("ethics-kit")).toBe(true);
    expect(isValidPluginId("Topic")).toBe(false);
    expect(isValidPluginId("a")).toBe(false);
  });

  it("allows built-in and plugin paths; rejects junk", () => {
    expect(isAgentPathAllowed("topic")).toBe(true);
    expect(isAgentPathAllowed("p.ethics-kit.irb-assist")).toBe(true);
    expect(isAgentPathAllowed("../etc/passwd")).toBe(false);
    expect(isAgentPathAllowed("")).toBe(false);
  });
});

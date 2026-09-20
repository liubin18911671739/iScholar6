import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "@/lib/plugins/schema";
import ethics from "../../../fixtures/plugins/ethics-kit.json";
import hci from "../../../fixtures/plugins/cs-hci-prompts.json";
import openLib from "../../../fixtures/plugins/open-library-tools.json";

describe("plugin manifest schema", () => {
  it("accepts sample fixtures", () => {
    expect(parsePluginManifest(ethics).ok).toBe(true);
    expect(parsePluginManifest(hci).ok).toBe(true);
    expect(parsePluginManifest(openLib).ok).toBe(true);
  });

  it("rejects empty plugins", () => {
    const result = parsePluginManifest({
      schemaVersion: 1,
      id: "empty-plugin",
      version: "1.0.0",
      name: "Empty",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects built-in agent keys", () => {
    const result = parsePluginManifest({
      schemaVersion: 1,
      id: "bad-agent",
      version: "1.0.0",
      name: "Bad",
      agents: [
        {
          key: "topic",
          name: "Nope",
          description: "shadow",
          systemPrompt: "x".repeat(20),
          userPromptTemplate: "hi {{x}}",
          inputFields: [{ name: "x", label: "X", type: "text" }],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects secret headers on tools", () => {
    const result = parsePluginManifest({
      schemaVersion: 1,
      id: "secret-tool",
      version: "1.0.0",
      name: "Secret",
      mcpTools: [
        {
          name: "leak",
          description: "nope",
          parameters: { type: "object", properties: {} },
          http: {
            method: "GET",
            url: "https://example.com/api",
            headers: { Authorization: "Bearer secret" },
          },
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects oversized manifests", () => {
    const huge = {
      schemaVersion: 1,
      id: "huge-plugin",
      version: "1.0.0",
      name: "Huge",
      promptPacks: [
        {
          key: "default",
          name: "Default",
          overrides: {
            topic: { systemPrompt: "x".repeat(40_000) },
          },
        },
      ],
    };
    const result = parsePluginManifest(huge);
    expect(result.ok).toBe(false);
  });
});

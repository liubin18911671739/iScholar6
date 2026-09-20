import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTemplate } from "@/lib/plugins/prompt-resolve";
import {
  __resetPluginRegistryForTests,
  rehydrateFromInstalls,
} from "@/lib/plugins/registry";
import { resolveSystemPrompt } from "@/lib/plugins/prompt-resolve";
import type { LocalPluginInstall } from "@/lib/local/db";

vi.mock("@/lib/local/db", () => {
  const selections = new Map<string, { id: string; packRef: string; updatedAt: string }>();
  return {
    localDB: {
      promptPackSelections: {
        get: async (id: string) => selections.get(id),
        put: async (row: { id: string; packRef: string; updatedAt: string }) => {
          selections.set(row.id, row);
        },
        delete: async (id: string) => {
          selections.delete(id);
        },
        toArray: async () => Array.from(selections.values()),
      },
      pluginInstalls: {
        toArray: async () => [],
        get: async () => undefined,
        put: async () => undefined,
        delete: async () => undefined,
        update: async () => undefined,
      },
    },
  };
});

describe("prompt resolve", () => {
  beforeEach(() => {
    __resetPluginRegistryForTests();
  });

  it("applies mustache-like templates", () => {
    expect(applyTemplate("Hello {{name}}!", { name: "Ada" })).toBe("Hello Ada!");
    expect(applyTemplate("{{a}}-{{b}}", { a: 1 })).toBe("1-");
  });

  it("returns builtin system prompt when no pack selected", async () => {
    const prompt = await resolveSystemPrompt("topic");
    expect(prompt.length).toBeGreaterThan(20);
  });

  it("uses pack override when selected and installed", async () => {
    const install: LocalPluginInstall = {
      id: "cs-hci-prompts",
      version: "1.0.0",
      enabled: true,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      manifest: {
        schemaVersion: 1,
        id: "cs-hci-prompts",
        version: "1.0.0",
        name: "HCI",
        promptPacks: [
          {
            key: "default",
            name: "HCI Default",
            overrides: {
              litreview: { systemPrompt: "HCI OVERRIDE PROMPT" },
            },
          },
        ],
      },
    };
    rehydrateFromInstalls([install]);

    const { localDB } = await import("@/lib/local/db");
    await localDB.promptPackSelections.put({
      id: "litreview",
      packRef: "cs-hci-prompts/default",
      updatedAt: new Date().toISOString(),
    });

    const prompt = await resolveSystemPrompt("litreview");
    expect(prompt).toBe("HCI OVERRIDE PROMPT");
  });
});

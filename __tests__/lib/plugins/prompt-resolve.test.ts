import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTemplate } from "@/lib/plugins/prompt-resolve";
import { __resetPluginRegistryForTests } from "@/lib/plugins/registry";
import { resolveSystemPrompt } from "@/lib/plugins/prompt-resolve";
import type { LocalPluginInstall } from "@/lib/types/domain";

const installs: LocalPluginInstall[] = [];
const selections: Array<{ id: string; packRef: string; updatedAt: string }> = [];

vi.mock("@/lib/client/plugins", () => ({
  listInstalls: async () => installs,
  listSelections: async () => selections,
  upsertInstall: async () => undefined,
  uninstall: async () => undefined,
  putSelection: async () => undefined,
  deleteSelection: async () => undefined,
}));

describe("prompt resolve", () => {
  beforeEach(() => {
    __resetPluginRegistryForTests();
    installs.length = 0;
    selections.length = 0;
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
    installs.push(install);

    const { bootstrapPlugins } = await import("@/lib/plugins/install");
    selections.push({ id: "litreview", packRef: "cs-hci-prompts/default", updatedAt: new Date().toISOString() });
    await bootstrapPlugins();

    const prompt = await resolveSystemPrompt("litreview");
    expect(prompt).toBe("HCI OVERRIDE PROMPT");
  });
});

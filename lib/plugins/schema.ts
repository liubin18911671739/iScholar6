/**
 * Plugin Schema (lib/plugins/schema.ts)
 *
 * Functionality:
 * - Defines the Zod schema for v1 plugin manifests (agents, prompt packs, declarative MCP tools).
 * - Enforces size/shape limits, slug formats, https-only tool URLs, and forbids secret headers.
 * - Exposes `parsePluginManifest` returning a typed success/error result and `MANIFEST_LIMITS`.
 *
 * Notes:
 * - Validates against `BUILTIN_AGENT_IDS` so plugin agent keys cannot shadow built-ins.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";
import { BUILTIN_AGENT_IDS } from "@/lib/ai/agents/registry";
import type { PluginManifest } from "./types";

// Hard size limits applied before and during manifest validation.
const MAX_MANIFEST_JSON_CHARS = 256 * 1024;
const MAX_PROMPT_CHARS = 30_000;
const MAX_DESCRIPTION_CHARS = 4_000;

// Plugin id must be a short lowercase slug.
const pluginIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,31}$/, "plugin id must be a short lowercase slug");

// Agent key must be a slug and must not collide with a built-in agent id.
const agentKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,31}$/, "agent key must be a short lowercase slug")
  .refine((k) => !(BUILTIN_AGENT_IDS as readonly string[]).includes(k), {
    message: "agent key cannot be a built-in agent id",
  });

// Schema for a single plugin agent input field.
const inputFieldSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "textarea", "number", "select"]),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
  options: z
    .array(z.object({ value: z.string().min(1).max(64), label: z.string().min(1).max(120) }))
    .max(50)
    .optional(),
  defaultValue: z.string().max(2000).optional(),
});

// Schema for a plugin agent definition (prompts, fields, context).
const agentDefSchema = z.object({
  key: agentKeySchema,
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(MAX_DESCRIPTION_CHARS),
  systemPrompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  userPromptTemplate: z.string().min(1).max(MAX_PROMPT_CHARS),
  inputFields: z.array(inputFieldSchema).min(1).max(30),
  contextFrom: z
    .array(
      z.object({
        agent: z.string().min(1).max(64),
        maxChars: z.number().int().min(100).max(10_000).optional(),
      })
    )
    .max(7)
    .optional(),
  outputSchema: z.record(z.unknown()).optional(),
  estimatedTokens: z.number().int().min(100).max(50_000).optional(),
  relatedBuiltIn: z
    .enum(BUILTIN_AGENT_IDS as unknown as [string, ...string[]])
    .optional(),
});

// Prompt-pack override must replace at least one of the two prompts.
const packOverrideSchema = z
  .object({
    systemPrompt: z.string().min(1).max(MAX_PROMPT_CHARS).optional(),
    userPromptTemplate: z.string().min(1).max(MAX_PROMPT_CHARS).optional(),
  })
  .refine((o) => o.systemPrompt != null || o.userPromptTemplate != null, {
    message: "pack override must include systemPrompt and/or userPromptTemplate",
  });

// Schema for a named prompt pack and its per-agent overrides.
const promptPackSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
  name: z.string().min(1).max(80),
  description: z.string().max(MAX_DESCRIPTION_CHARS).optional(),
  overrides: z.record(packOverrideSchema).refine((o) => Object.keys(o).length > 0, {
    message: "prompt pack must override at least one agent",
  }),
});

// Allowed JSON Schema property subset for declarative tool parameters.
const jsonSchemaPropSchema = z.object({
  type: z.enum(["string", "number", "boolean", "array"]).optional(),
  description: z.string().max(500).optional(),
  items: z.object({ type: z.enum(["string", "number", "boolean"]).optional() }).optional(),
});

// Headers that could carry secrets and are therefore rejected in manifests.
const forbiddenHeader = (name: string) =>
  /^(authorization|api[-_]?key|x-api-key|proxy-authorization)$/i.test(name);

// Schema for a declarative MCP tool (https-only, no secret headers).
const mcpToolSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "tool name must be lowercase snake_case"),
  description: z.string().min(1).max(MAX_DESCRIPTION_CHARS),
  parameters: z.object({
    type: z.literal("object"),
    properties: z.record(jsonSchemaPropSchema).optional(),
    required: z.array(z.string()).optional(),
  }),
  http: z.object({
    method: z.enum(["GET", "POST"]),
    url: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), { message: "tool URL must be https" }),
    headers: z
      .record(z.string().max(500))
      .optional()
      .superRefine((headers, ctx) => {
        if (!headers) return;
        for (const key of Object.keys(headers)) {
          if (forbiddenHeader(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `header "${key}" is not allowed in manifests (no secrets)`,
            });
          }
        }
      }),
    bodyTemplate: z.literal("json-params").optional(),
    timeoutMs: z.number().int().min(1_000).max(60_000).optional(),
  }),
  resultPath: z.string().max(120).optional(),
});

/** Full plugin manifest schema with cross-field content and uniqueness checks. */
export const pluginManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: pluginIdSchema,
    version: z.string().min(1).max(32),
    name: z.string().min(1).max(80),
    description: z.string().max(MAX_DESCRIPTION_CHARS).optional(),
    author: z.string().max(120).optional(),
    agents: z.array(agentDefSchema).max(20).optional(),
    promptPacks: z.array(promptPackSchema).max(20).optional(),
    mcpTools: z.array(mcpToolSchema).max(30).optional(),
  })
  .superRefine((manifest, ctx) => {
    const hasContent =
      (manifest.agents?.length ?? 0) > 0 ||
      (manifest.promptPacks?.length ?? 0) > 0 ||
      (manifest.mcpTools?.length ?? 0) > 0;
    if (!hasContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plugin must declare at least one agent, prompt pack, or mcp tool",
      });
    }
    const agentKeys = new Set<string>();
    for (const agent of manifest.agents ?? []) {
      if (agentKeys.has(agent.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate agent key: ${agent.key}`,
        });
      }
      agentKeys.add(agent.key);
    }
    const packKeys = new Set<string>();
    for (const pack of manifest.promptPacks ?? []) {
      if (packKeys.has(pack.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate prompt pack key: ${pack.key}`,
        });
      }
      packKeys.add(pack.key);
    }
    const toolNames = new Set<string>();
    for (const tool of manifest.mcpTools ?? []) {
      if (toolNames.has(tool.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate mcp tool name: ${tool.name}`,
        });
      }
      toolNames.add(tool.name);
    }
  });

/** Parse and validate an unknown value into a plugin manifest result. */
export function parsePluginManifest(input: unknown): {
  ok: true;
  data: PluginManifest;
} | {
  ok: false;
  error: string;
} {
  try {
    const raw = typeof input === "string" ? input : JSON.stringify(input);
    if (raw.length > MAX_MANIFEST_JSON_CHARS) {
      return { ok: false, error: `manifest exceeds ${MAX_MANIFEST_JSON_CHARS} characters` };
    }
    const json = typeof input === "string" ? JSON.parse(input) : input;
    const parsed = pluginManifestSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; "),
      };
    }
    return { ok: true, data: parsed.data as PluginManifest };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "invalid JSON",
    };
  }
}

/** Public size limits applied to plugin manifests and prompts. */
export const MANIFEST_LIMITS = {
  MAX_MANIFEST_JSON_CHARS,
  MAX_PROMPT_CHARS,
} as const;

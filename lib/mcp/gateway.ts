/**
 * MCP Tool Gateway (lib/mcp/gateway.ts)
 *
 * Functionality:
 * - Maintains an in-memory registry of MCP tools keyed by name.
 * - Registers/unregisters tools while protecting built-ins from plugin overwrites.
 * - Validates parameters with the tool's Zod schema and invokes its execute function.
 *
 * Notes:
 * - Plugin tools can be removed wholesale by pluginId; built-ins cannot be unregistered.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";

/** A registered MCP tool with a Zod parameter schema and async executor. */
export interface MCPTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (params: unknown) => Promise<unknown>;
  /** Origin of the tool registration. Built-ins never get overwritten by plugins. */
  source?: "builtin" | "plugin";
  pluginId?: string;
}

// Singleton registry of all known MCP tools, keyed by tool name.
const toolRegistry = new Map<string, MCPTool>();

/** Adds a tool, rejecting plugin attempts to shadow an existing built-in. */
export function registerTool(tool: MCPTool): void {
  const existing = toolRegistry.get(tool.name);
  if (existing?.source === "builtin" && tool.source === "plugin") {
    throw new Error(`Cannot overwrite built-in MCP tool: ${tool.name}`);
  }
  const withSource: MCPTool = {
    ...tool,
    source: tool.source ?? "builtin",
  };
  toolRegistry.set(tool.name, withSource);
}

/** Removes a tool by name, refusing to remove built-ins. */
export function unregisterTool(name: string): void {
  const existing = toolRegistry.get(name);
  if (!existing) return;
  if (existing.source === "builtin") return;
  toolRegistry.delete(name);
}

/** Removes every plugin tool belonging to the given pluginId. */
export function unregisterByPlugin(pluginId: string): void {
  Array.from(toolRegistry.entries()).forEach(([name, tool]) => {
    if (tool.source === "plugin" && tool.pluginId === pluginId) {
      toolRegistry.delete(name);
    }
  });
}

/** Returns the registered tool with the given name, if any. */
export function getTool(name: string): MCPTool | undefined {
  return toolRegistry.get(name);
}

/** Lists public metadata (name, description, source) for all registered tools. */
export function listTools(): {
  name: string;
  description: string;
  source?: "builtin" | "plugin";
  pluginId?: string;
}[] {
  return Array.from(toolRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    source: t.source,
    pluginId: t.pluginId,
  }));
}

/** Validates params against the tool schema and runs the tool's execute. */
export async function callTool(name: string, params: unknown): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const parsed = tool.parameters.safeParse(params);
  if (!parsed.success) {
    throw new Error(`Invalid parameters: ${parsed.error.message}`);
  }

  return tool.execute(parsed.data);
}

import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";

// We test the gateway by importing it fresh each time.
// The gateway uses a module-level Map, so we need to be careful
// about state between tests. We'll use unique tool names.
import {
  registerTool,
  getTool,
  listTools,
  callTool,
  type MCPTool,
} from "@/lib/mcp/gateway";

// Helper to create a test tool
function makeTool(name: string, extra?: Partial<MCPTool>): MCPTool {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: z.object({ value: z.string() }),
    execute: async (params: unknown) => ({ result: (params as any).value }),
    ...extra,
  };
}

describe("MCP Gateway", () => {
  const uniquePrefix = `test_${Date.now()}_`;

  it("registerTool and getTool work together", () => {
    const name = `${uniquePrefix}get`;
    registerTool(makeTool(name));
    const tool = getTool(name);
    expect(tool).toBeDefined();
    expect(tool!.name).toBe(name);
  });

  it("getTool returns undefined for unknown tool", () => {
    expect(getTool("nonexistent_tool_xyz")).toBeUndefined();
  });

  it("listTools returns all registered tools", () => {
    const n1 = `${uniquePrefix}list1`;
    const n2 = `${uniquePrefix}list2`;
    registerTool(makeTool(n1));
    registerTool(makeTool(n2));
    const tools = listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain(n1);
    expect(names).toContain(n2);
  });

  it("listTools returns name and description for each tool", () => {
    const name = `${uniquePrefix}meta`;
    registerTool(makeTool(name, { description: "Custom description" }));
    const tools = listTools();
    const tool = tools.find((t) => t.name === name);
    expect(tool).toBeDefined();
    expect(tool!.description).toBe("Custom description");
  });

  it("callTool executes the tool with validated params", async () => {
    const name = `${uniquePrefix}call`;
    registerTool(makeTool(name));
    const result = await callTool(name, { value: "hello" });
    expect(result).toEqual({ result: "hello" });
  });

  it("callTool throws for unknown tool", async () => {
    await expect(callTool("nonexistent_xyz", {})).rejects.toThrow("Unknown tool");
  });

  it("callTool throws for invalid params (Zod validation)", async () => {
    const name = `${uniquePrefix}valid`;
    registerTool(makeTool(name));
    // Missing required 'value' field
    await expect(callTool(name, {})).rejects.toThrow("Invalid parameters");
  });

  it("callTool throws for wrong param types", async () => {
    const name = `${uniquePrefix}type`;
    registerTool(makeTool(name));
    // 'value' should be string, not number
    await expect(callTool(name, { value: 123 })).rejects.toThrow();
  });
});

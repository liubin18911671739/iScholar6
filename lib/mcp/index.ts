/**
 * MCP Module Entry (lib/mcp/index.ts)
 *
 * Functionality:
 * - Side-effect imports of every MCP tool module so their tools self-register.
 * - Re-exports the gateway API (listTools, callTool, getTool) for consumers.
 *
 * Notes:
 * - Importing this module is required before any tool can be discovered or called.
 *
 * @author mrpi
 * @date 2026-09-16
 */

// Import all tool modules to trigger registration
import "./tools/scholar-search";
import "./tools/citation-parser";
import "./tools/journal-finder";

// Re-export the gateway surface used by API routes and callers.
export { listTools, callTool, getTool } from "./gateway";

/**
 * Declarative MCP (lib/plugins/mcp-declarative.ts)
 *
 * Functionality:
 * - Converts manifest JSON Schema subsets into Zod schemas for MCP tool parameters.
 * - Executes declarative HTTP tools with SSRF guards, timeouts, and response-size limits.
 * - Binds a declarative definition into an `MCPTool` for registration in the gateway.
 *
 * Notes:
 * - Blocks private/link-local hosts and requires https without embedded credentials.
 * - Collaborates with `@/lib/mcp/gateway` for the `MCPTool` contract.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";
import type { DeclarativeMcpToolDefinition, JsonSchemaObject } from "./types";
import type { MCPTool } from "@/lib/mcp/gateway";

// Hostnames that must never be reached (loopback, private ranges, cloud metadata).
const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|metadata\.google\.internal)$/i;

// Upper bound on accepted tool response size (2 MiB).
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** True when the hostname is loopback, private, link-local, or metadata. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (PRIVATE_HOST_RE.test(host)) return true;
  // IPv6 unique local / link-local rough check
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

/** Validate a tool URL is https, host-safe, and credential-free, returning it parsed. */
export function assertSafeHttpsUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid tool URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Tool URL must use https");
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error(`Blocked host: ${url.hostname}`);
  }
  if (url.username || url.password) {
    throw new Error("Tool URL must not include credentials");
  }
  return url;
}

/** Build a Zod object schema from a small JSON Schema subset. */
export function jsonSchemaToZod(schema: JsonSchemaObject): z.ZodType {
  const shape: Record<string, z.ZodTypeAny> = {};
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [key, prop] of Object.entries(props)) {
    let field: z.ZodTypeAny;
    switch (prop.type) {
      case "number":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array": {
        const itemType = prop.items?.type;
        const item =
          itemType === "number"
            ? z.number()
            : itemType === "boolean"
              ? z.boolean()
              : z.string();
        field = z.array(item);
        break;
      }
      case "string":
      default:
        field = z.string();
        break;
    }
    shape[key] = required.has(key) ? field : field.optional();
  }

  return z.object(shape).passthrough();
}

// Substitute `{name}` placeholders in a URL template with URL-encoded params.
function interpolateUrl(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) return "";
    return encodeURIComponent(String(value));
  });
}

// Walk a dotted path into an object, returning `undefined` on any miss.
function dig(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Execute a declarative HTTP tool definition and return the parsed result. */
export async function executeDeclarativeHttp(
  def: DeclarativeMcpToolDefinition,
  params: Record<string, unknown>
): Promise<unknown> {
  const urlString = interpolateUrl(def.http.url, params);
  const url = assertSafeHttpsUrl(urlString);
  // Clamp caller-specified timeout into a safe 1–60s band.
  const timeoutMs = Math.min(def.http.timeoutMs ?? 20_000, 60_000);
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    ...(def.http.headers ?? {}),
  };

  const init: RequestInit = {
    method: def.http.method,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  };

  if (def.http.method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(
      def.http.bodyTemplate === "json-params" || !def.http.bodyTemplate
        ? params
        : params
    );
  }

  const res = await fetch(url.toString(), init);
  if (!res.ok) {
    throw new Error(`Plugin tool HTTP ${res.status}: ${res.statusText}`);
  }

  // Enforce the response-size cap before decoding the body.
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("Plugin tool response too large");
  }

  const text = new TextDecoder().decode(buf);
  const contentType = res.headers.get("content-type") ?? "";
  let data: unknown = text;
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (def.resultPath) {
    return dig(data, def.resultPath);
  }
  return data;
}

/** Wrap a declarative definition as an `MCPTool` bound to its plugin. */
export function bindDeclarativeTool(
  def: DeclarativeMcpToolDefinition,
  pluginId: string
): MCPTool {
  const parameters = jsonSchemaToZod(def.parameters);
  return {
    name: def.name,
    description: def.description,
    parameters,
    source: "plugin",
    pluginId,
    execute: async (params) => {
      const record =
        params && typeof params === "object" && !Array.isArray(params)
          ? (params as Record<string, unknown>)
          : {};
      return executeDeclarativeHttp(def, record);
    },
  };
}

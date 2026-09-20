/**
 * Hermes Chat API (/api/hermes/chat)
 *
 * Functionality:
 * - POST streams a conversational reply from DeepSeek for a selected built-in agent module.
 * - Authenticates the caller and enforces body-size and rate limits before contacting the AI service.
 * - Validates `agentId` and the user/assistant message history, including per-message length caps.
 *
 * Notes:
 * - Builds a module-specific system prompt from the agent registry and its expertise prompt.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { NextRequest } from "next/server";
import { isValidAgent, AGENT_META, type BuiltInAgentId } from "@/lib/ai/agents/registry";
import {
  TOPIC_SCOUT_PROMPT,
  LIT_REVIEW_PROMPT,
  DESIGN_PROMPT,
  DATA_PILOT_PROMPT,
  IMRAD_WRITER_PROMPT,
  SUBMIT_MATCH_PROMPT,
  REBUTTAL_PROMPT,
} from "@/lib/ai/prompts";
import { checkBodySize, checkRateLimit, jsonError, requireApiUser, timeoutSignal } from "@/lib/server/request-guards";

/** Forces the Node.js runtime so streaming fetch is available. */
export const runtime = "nodejs";
/** Allows chat streams to run for up to five minutes. */
export const maxDuration = 300;

/** Maps each built-in agent id to its domain expertise prompt. */
const AGENT_PROMPTS: Record<BuiltInAgentId, string> = {
  topic: TOPIC_SCOUT_PROMPT,
  litreview: LIT_REVIEW_PROMPT,
  design: DESIGN_PROMPT,
  data: DATA_PILOT_PROMPT,
  write: IMRAD_WRITER_PROMPT,
  submit: SUBMIT_MATCH_PROMPT,
  rebuttal: REBUTTAL_PROMPT,
};

/** Builds the conversational system prompt for the selected module assistant. */
function buildHermesSystemPrompt(agentId: BuiltInAgentId): string {
  const meta = AGENT_META[agentId];
  const expertise = AGENT_PROMPTS[agentId];

  return `You are the iScholar Module Assistant, helping a researcher who is currently using the **${meta.name}** module.

${meta.description}

You are in **conversational assistant mode**. Your role is to:
- Answer questions about this research stage
- Explain concepts, methods, and best practices
- Provide suggestions and guidance
- Help the user understand the module's features and outputs

Do NOT generate full agent outputs unless specifically asked. Be helpful, concise, and conversational. Respond in the same language the user uses.

For context, here is your expertise in this domain:
${expertise}`;
}

/** Streams a conversational reply from DeepSeek for a selected agent module. */
export async function POST(req: NextRequest) {
  try {
    // Authenticate, then enforce request size and rate limits.
    const auth = await requireApiUser(req);
    if (!auth.ok) return jsonError("UNAUTHENTICATED", 401);
    if (!checkBodySize(req)) return jsonError("REQUEST_TOO_LARGE", 413);
    const limit = checkRateLimit(req, "hermes");
    if (!limit.ok) return jsonError("RATE_LIMITED", 429, { "Retry-After": String(limit.retryAfter) });
    // Parse the body and validate the agent id and message history.
    const body = await req.json();
    const agentId = body.agentId as string | undefined;
    const messages = body.messages as Array<{ role: string; content: string }> | undefined;

    if (!agentId || !isValidAgent(agentId)) {
      return Response.json(
        { ok: false, error: `Invalid or missing agentId: ${agentId}` },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0 || messages.length > 30 || messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 20_000)) {
      return Response.json(
        { ok: false, error: "messages array is required" },
        { status: 400 }
      );
    }

    // Assemble the module-specific system prompt and API message list.
    const systemPrompt = buildHermesSystemPrompt(agentId);

    const apiUrl =
      process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";
    const model =
      process.env.DEEPSEEK_MODEL ??
      process.env.NEXT_PUBLIC_DEEPSEEK_MODEL ??
      "deepseek-chat";
    if (!process.env.DEEPSEEK_API_KEY) return jsonError("AI_SERVICE_NOT_CONFIGURED", 503);

    // Prepend the system prompt to the sanitized conversation history.
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: apiMessages,
      }),
      signal: timeoutSignal(300_000),
    });

    // Map upstream DeepSeek failures to friendlier client messages.
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Hermes DeepSeek API error (${response.status}):`, errorText);
      const message =
        response.status === 401
          ? "Invalid API key — check DEEPSEEK_API_KEY"
          : response.status === 429
            ? "Rate limited by DeepSeek — retry in a few seconds"
            : `DeepSeek API error: ${response.status}`;
      return Response.json(
        { ok: false, error: message },
        { status: response.status }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("POST /api/hermes/chat error:", e);
    return Response.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

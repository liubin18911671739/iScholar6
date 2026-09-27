import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runLanggraphAgent: vi.fn(async () =>
    new Response("hello from graph", { status: 200, headers: { "content-type": "text/plain" } })
  ),
}));

vi.mock("@/lib/server/agent-runtime", () => ({
  runLanggraphAgent: mocks.runLanggraphAgent,
}));

vi.mock("@/lib/server/request-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/request-guards")>();
  return { ...actual, verifyConsent: vi.fn(async () => true) };
});

import { POST as postAgent } from "@/app/api/agents/[agent]/route";

const originalRuntime = process.env.AGENT_RUNTIME;
const originalCollaborativeMode = process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;

function request(body: unknown) {
  return new Request("http://localhost/api/agents/topic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("agent runtime switch", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = "false";
    process.env.AGENT_RUNTIME = "langgraph";
    mocks.runLanggraphAgent.mockClear();
  });

  afterEach(() => {
    if (originalRuntime === undefined) delete process.env.AGENT_RUNTIME;
    else process.env.AGENT_RUNTIME = originalRuntime;
    if (originalCollaborativeMode === undefined) delete process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;
    else process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = originalCollaborativeMode;
  });

  it("delegates to the LangGraph runtime when enabled", async () => {
    const res = await postAgent(
      request({
        projectId: "project-1",
        systemPrompt: "system",
        userPrompt: "user",
        discipline: "CS",
        consentProof: { consentId: "c1" },
      }),
      { params: { agent: "topic" } }
    );

    expect(mocks.runLanggraphAgent).toHaveBeenCalledTimes(1);
    const call = mocks.runLanggraphAgent.mock.calls[0][0] as { agentId: string; input: Record<string, unknown> };
    expect(call.agentId).toBe("topic");
    expect(call.input).toEqual({ discipline: "CS" });
    await expect(res.text()).resolves.toBe("hello from graph");
  });
});

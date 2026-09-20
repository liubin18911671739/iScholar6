import { describe, it, expect } from "vitest";
import { parseAgentOutput } from "@/lib/ai/parse-agent-output";

describe("parseAgentOutput", () => {
  it("returns parsed data for valid JSON block with topic agent", () => {
    const text = `Here is my analysis.\n\n\`\`\`json\n{"topics":[{"title":"AI in Education","gap":"Lack of longitudinal studies","novelty":8,"value":7,"feasibility":6,"rationale":"Growing field"}]}\n\`\`\``;

    const result = parseAgentOutput("topic", text);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("topics");
    expect(result!.topics).toHaveLength(1);
    expect(result!.topics[0].title).toBe("AI in Education");
  });

  it("returns parsed data for litreview agent", () => {
    const text = `Some review text.\n\n\`\`\`json\n{"papers":[{"title":"Paper 1","authors":["Author A"],"year":2024,"venue":"Nature","method":"RCT","findings":"Significant results","doi":"10.1234/test"}],"themes":["AI","Education"],"gaps":["Longitudinal studies needed"]}\n\`\`\``;

    const result = parseAgentOutput("litreview", text);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("papers");
  });

  it("returns the LAST JSON block when multiple exist", () => {
    const text = `First block:\n\`\`\`json\n{"topics":[{"title":"Old","gap":"","novelty":1,"value":1,"feasibility":1,"rationale":""}]}\n\`\`\`\n\nUpdated:\n\`\`\`json\n{"topics":[{"title":"New","gap":"","novelty":9,"value":9,"feasibility":9,"rationale":"Better"}]}\n\`\`\``;

    const result = parseAgentOutput("topic", text);
    expect(result).not.toBeNull();
    expect(result!.topics[0].title).toBe("New");
  });

  it("returns null when no JSON block is present", () => {
    const text = "Just plain text without any JSON blocks.";
    expect(parseAgentOutput("topic", text)).toBeNull();
  });

  it("returns null for invalid JSON inside code block", () => {
    const text = "Results:\n\`\`\`json\n{not valid json}\n\`\`\`";
    expect(parseAgentOutput("topic", text)).toBeNull();
  });

  it("returns null for valid JSON that doesn't match schema", () => {
    const jsonBlock = [96, 96, 96].map(c => String.fromCharCode(c)).join("");
    const text = "Results:\n" + jsonBlock + "json\n{" + '"' + "wrong" + '"' + ": " + '"' + "field" + '"' + "}\n" + jsonBlock;
    expect(parseAgentOutput("topic", text)).toBeNull();
  });

  it("works with all 7 agent IDs", () => {
    const agentTexts: Record<string, string> = {
      topic: `\`\`\`json\n{"topics":[]}\n\`\`\``,
      litreview: `\`\`\`json\n{"papers":[]}\n\`\`\``,
      design: `\`\`\`json\n{"feasibility":{"score":7,"factors":[]}}\n\`\`\``,
      data: `\`\`\`json\n{"scripts":[]}\n\`\`\``,
      write: `\`\`\`json\n{"references":[]}\n\`\`\``,
      submit: `\`\`\`json\n{"journals":[]}\n\`\`\``,
      rebuttal: `\`\`\`json\n{"responses":[]}\n\`\`\``,
    };

    for (const [agent, text] of Object.entries(agentTexts)) {
      const result = parseAgentOutput(agent as any, text);
      expect(result).not.toBeNull();
    }
  });
});

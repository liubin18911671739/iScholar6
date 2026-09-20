import { describe, expect, it } from "vitest";
import {
  agentsCompletedByTraining,
  buildTaskCatalog,
  catalogHasTask,
  expandPackToCatalog,
  packTaskId,
} from "@/lib/training/task-catalog";
import { resolveProgramCurriculum } from "@/lib/training/progress";
import { parseTrainingTaskPackJson } from "@/lib/training/task-pack-schema";

describe("task catalog", () => {
  const pack = {
    key: "demo-pack",
    name: "Demo",
    tasks: [
      {
        id: "lit-note",
        title: "Lit note",
        description: "desc",
        agent: "litreview",
        dimension: "critical-evaluation",
        steps: ["a", "b"],
        requiresReview: true,
      },
    ],
  };

  it("expands pack task ids as pack.key", () => {
    const tasks = expandPackToCatalog(pack);
    expect(tasks[0].id).toBe("demo-pack.lit-note");
    expect(tasks[0].source).toBe("pack");
  });

  it("merges builtin and pack in catalog", () => {
    const catalog = buildTaskCatalog([pack]);
    expect(catalogHasTask("research-question", catalog)).toBe(true);
    expect(catalogHasTask(packTaskId("demo-pack", "lit-note"), catalog)).toBe(true);
  });

  it("resolves curriculum with pack tasks", () => {
    const curriculum = resolveProgramCurriculum(
      [{ taskId: "demo-pack.lit-note", ordinal: 0, required: true }],
      { packs: [pack] }
    );
    expect(curriculum).toHaveLength(1);
    expect(curriculum[0].definition.title).toBe("Lit note");
  });

  it("maps completed training tasks to agents", () => {
    const agents = agentsCompletedByTraining({
      taskStatuses: [
        { taskId: "research-question", status: "approved" },
        { taskId: "demo-pack.lit-note", status: "approved" },
      ],
      catalog: buildTaskCatalog([pack]),
    });
    expect(agents.has("topic")).toBe(true);
    expect(agents.has("litreview")).toBe(true);
  });
});

describe("task pack schema", () => {
  it("accepts valid pack", () => {
    const result = parseTrainingTaskPackJson({
      key: "my-pack",
      name: "My pack",
      tasks: [
        {
          id: "t1",
          title: "T1",
          description: "d",
          agent: "topic",
          dimension: "ai-literacy",
          steps: ["s1"],
          requiresReview: false,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects bad agent", () => {
    const result = parseTrainingTaskPackJson({
      key: "my-pack",
      name: "My pack",
      tasks: [
        {
          id: "t1",
          title: "T1",
          description: "d",
          agent: "not-an-agent",
          dimension: "ai-literacy",
          steps: ["s1"],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  allStepsComplete,
  buildSubmitChecklist,
  canSubmitFromChecklist,
  countCompletedSteps,
  isStepComplete,
} from "@/lib/training/submit-checklist";
import {
  checkFinalResearchQuestion,
  finalChecksPassed,
} from "@/lib/training/final-question-checks";
import {
  hydrateAnswers,
  isCompareTableComplete,
  parseCompareTable,
  serializeCompareTable,
  typedStepsComplete,
  getTypedTaskDefinition,
} from "@/lib/training/step-types";
import {
  buildCurriculumPackJson,
  expandCurriculumPack,
  parseTrainingTaskPackJson,
} from "@/lib/training/task-pack-schema";
import { sanitizeTrainingReturnTo } from "@/lib/training/safe-return";

describe("submit-checklist", () => {
  it("detects step completion with minChars", () => {
    expect(isStepComplete("hi", 5)).toBe(false);
    expect(isStepComplete("hello!", 5)).toBe(true);
  });

  it("counts completed steps by index keys", () => {
    const answers = { "0": "enough text here", "1": "x", "2": "also enough chars!!" };
    expect(countCompletedSteps(answers, 3, [10, 10, 10])).toBe(2);
    expect(allStepsComplete(answers, 3, [5, 1, 5])).toBe(true);
  });

  it("builds required checklist and canSubmit", () => {
    const items = buildSubmitChecklist({
      answers: { "0": "aaaaaaaaaa", "1": "bbbbbbbbbb" },
      stepCount: 2,
      minCharsByStep: [5, 5],
      reflection: "edited",
      hasSensitive: false,
      evidenceCount: 0,
    });
    expect(canSubmitFromChecklist(items)).toBe(true);

    const blocked = buildSubmitChecklist({
      answers: {},
      stepCount: 2,
      reflection: "",
      hasSensitive: true,
      requireEvidence: true,
      evidenceCount: 0,
    });
    expect(canSubmitFromChecklist(blocked)).toBe(false);
    expect(blocked.find((i) => i.id === "evidence")?.required).toBe(true);
  });
});

describe("final-question-checks", () => {
  it("passes a reasonable research question", () => {
    const q =
      "在允许使用生成式AI的本科课程论文中，不同提示词策略如何影响引用准确性？";
    expect(finalChecksPassed(q)).toBe(true);
    expect(checkFinalResearchQuestion(q).every((c) => c.ok)).toBe(true);
  });

  it("fails short slogan", () => {
    expect(finalChecksPassed("全面禁止")).toBe(false);
  });
});

describe("step-types", () => {
  it("serializes and parses compare tables", () => {
    const raw = serializeCompareTable([
      {
        candidate: "Q1",
        novelty: "n",
        value: "v",
        feasibility: "f",
        decision: "keep",
      },
      {
        candidate: "Q2",
        novelty: "n2",
        value: "",
        feasibility: "",
        decision: "drop",
      },
      {
        candidate: "Q3",
        novelty: "n3",
        value: "v3",
        feasibility: "f3",
        decision: "",
      },
    ]);
    expect(isCompareTableComplete(raw, 3)).toBe(true);
    expect(parseCompareTable(raw)).toHaveLength(3);
  });

  it("hydrates legacy index keys into step ids", () => {
    const typed = getTypedTaskDefinition("research-question")!;
    const ids = typed.steps.map((s) => s.id);
    const out = hydrateAnswers({ "0": "obj", "1": "{}" }, ids);
    expect(out.object).toBe("obj");
  });

  it("research-question typed steps complete with sample", () => {
    const typed = getTypedTaskDefinition("research-question")!;
    expect(typedStepsComplete(typed.sampleAnswers!, typed.steps)).toBe(true);
  });
});

describe("task-pack schema v2", () => {
  it("expands curriculum pack from built-in ids", () => {
    const pack = buildCurriculumPackJson({
      key: "spring",
      name: "Spring",
      taskIds: ["research-question", "retrieval-query"],
    });
    const expanded = expandCurriculumPack(pack);
    expect(expanded.ok).toBe(true);
    if (expanded.ok) {
      expect(expanded.pack.tasks).toHaveLength(2);
      expect(expanded.pack.tasks[0].id).toBe("research-question");
    }
  });

  it("rejects unknown task ids", () => {
    const parsed = parseTrainingTaskPackJson({
      schemaVersion: 2,
      key: "bad",
      name: "Bad",
      tasks: [{ taskId: "not-a-real-task", required: true }],
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("safe-return", () => {
  it("only allows /training paths", () => {
    expect(sanitizeTrainingReturnTo("/training/tasks/x")).toBe(
      "/training/tasks/x"
    );
    expect(sanitizeTrainingReturnTo("https://evil.com")).toBeNull();
    expect(sanitizeTrainingReturnTo("//evil")).toBeNull();
    expect(sanitizeTrainingReturnTo("/projects")).toBeNull();
  });
});

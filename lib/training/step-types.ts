/**
 * Typed Step Types (lib/training/step-types.ts)
 *
 * Functionality:
 * - Defines `StepType` and typed step/task shapes for structured training tasks.
 * - Serializes/parses compare tables and checks step completion.
 * - Maps legacy MVP tasks into typed definitions and stores agent run ids in answers.
 *
 * Notes:
 * - Pure helpers consumed by rubric, checklist, and task editor components.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { AgentId } from "@/lib/ai/agents/registry";
import type { TrainingDimension } from "@/lib/local/db";
import { MVP_TRAINING_TASKS, type TrainingTaskDefinition } from "./registry";

/** Supported step input/widget types. */
export type StepType =
  | "free_text"
  | "compare_table"
  | "final_statement"
  | "diff_note"
  | "evidence_bind"
  | "select_one";

/** Definition of one typed step within a typed task. */
export interface TypedStepDef {
  id: string;
  type: StepType;
  /** Fallback title when i18n missing */
  title: string;
  minChars?: number;
  /** compare_table */
  rows?: number;
  columns?: string[];
  /** select_one */
  options?: string[];
  /** final_statement client checks enabled */
  enableFinalChecks?: boolean;
}

/** Definition of a typed task with ordered typed steps. */
export interface TypedTaskDefinition {
  id: string;
  title: string;
  description: string;
  agent: AgentId;
  dimension: TrainingDimension;
  requiresReview: boolean;
  steps: TypedStepDef[];
  /** Sample answers for "fill example" (string values; tables as JSON) */
  sampleAnswers?: Record<string, string>;
}

/** Compare-table cell model */
export interface CompareTableRow {
  candidate: string;
  novelty: string;
  value: string;
  feasibility: string;
  decision: "keep" | "drop" | "";
}

/** Create `n` empty compare-table rows. */
export function emptyCompareRows(n: number): CompareTableRow[] {
  return Array.from({ length: n }, () => ({
    candidate: "",
    novelty: "",
    value: "",
    feasibility: "",
    decision: "",
  }));
}

/** Serialize compare-table rows into their stored JSON string form. */
export function serializeCompareTable(rows: CompareTableRow[]): string {
  return JSON.stringify({ rows });
}

/** Parse stored compare-table JSON, falling back to three empty rows. */
export function parseCompareTable(raw: string | undefined): CompareTableRow[] {
  if (!raw?.trim()) return emptyCompareRows(3);
  try {
    const parsed = JSON.parse(raw) as { rows?: CompareTableRow[] };
    if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      return parsed.rows.map((r) => ({
        candidate: r.candidate ?? "",
        novelty: r.novelty ?? "",
        value: r.value ?? "",
        feasibility: r.feasibility ?? "",
        decision: r.decision === "keep" || r.decision === "drop" ? r.decision : "",
      }));
    }
  } catch {
    /* plain text legacy */
  }
  return emptyCompareRows(3);
}

/** True when at least `minRows` rows have a candidate plus some analysis. */
export function isCompareTableComplete(
  raw: string | undefined,
  minRows = 3
): boolean {
  const rows = parseCompareTable(raw);
  const filled = rows.filter(
    (r) => r.candidate.trim() && (r.novelty.trim() || r.value.trim() || r.feasibility.trim())
  );
  return filled.length >= minRows;
}

/**
 * Hydrate answers: prefer stepId keys; fall back to index keys from legacy submissions.
 */
export function hydrateAnswers(
  stored: Record<string, string> | undefined,
  stepIds: string[]
): Record<string, string> {
  const src = stored ?? {};
  const out: Record<string, string> = { ...src };
  stepIds.forEach((id, i) => {
    if (out[id] == null || out[id] === "") {
      const legacy = src[String(i)];
      if (legacy != null && legacy !== "") out[id] = legacy;
    }
  });
  return out;
}

/** Whether every typed step has enough content */
export function typedStepsComplete(
  answers: Record<string, string>,
  steps: TypedStepDef[]
): boolean {
  return steps.every((step) => {
    const v = answers[step.id];
    if (step.type === "compare_table") {
      return isCompareTableComplete(v, step.rows ?? 3);
    }
    const min = step.minChars ?? 1;
    return (v ?? "").trim().length >= min;
  });
}

/** Legacy free-text task from registry → typed free_text steps */
export function legacyToTyped(def: TrainingTaskDefinition): TypedTaskDefinition {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    agent: def.agent,
    dimension: def.dimension,
    requiresReview: def.requiresReview,
    steps: def.steps.map((title, i) => ({
      id: `s${i}`,
      type: "free_text" as const,
      title,
      minChars: def.stepMinChars?.[i] ?? 20,
    })),
  };
}

// Hand-authored typed definition for the research-question MVP task.
const RESEARCH_QUESTION_TYPED: TypedTaskDefinition = {
  id: "research-question",
  title: "从兴趣到可检索研究问题",
  description:
    "比较三个候选问题，说明新颖性、价值和可行性，并完成一次人工修改。",
  agent: "topic",
  dimension: "critical-evaluation",
  requiresReview: false,
  steps: [
    {
      id: "object",
      type: "free_text",
      title: "明确研究对象和场景",
      minChars: 30,
    },
    {
      id: "compare",
      type: "compare_table",
      title: "比较三个候选问题",
      rows: 3,
      columns: ["candidate", "novelty", "value", "feasibility", "decision"],
    },
    {
      id: "rationale",
      type: "free_text",
      title: "填写保留或放弃理由",
      minChars: 30,
    },
    {
      id: "final",
      type: "final_statement",
      title: "提交最终研究问题",
      minChars: 20,
      enableFinalChecks: true,
    },
  ],
  sampleAnswers: {
    object:
      "研究对象为全日制本科生在课程论文写作中的生成式AI使用行为；场景限定国内高校通识/专业课作业（非学位论文、非考试），关注提示词—引用核验—教师反馈链路。",
    compare: serializeCompareTable([
      {
        candidate: "生成式AI是否提高本科生论文写作质量？",
        novelty: "低，描述性调查已多",
        value: "中，政策关注高",
        feasibility: "中，质量指标难统一",
        decision: "drop",
      },
      {
        candidate:
          "课程论文文献综述中，不同提示词策略如何影响引用准确性与幻觉率？",
        novelty: "中高，绑定可观测指标",
        value: "高，可指导教学",
        feasibility: "高，可收集作业与提示词日志",
        decision: "keep",
      },
      {
        candidate: "高校是否应全面禁止学生使用生成式AI？",
        novelty: "低，规范争论为主",
        value: "中",
        feasibility: "低，难做可重复设计",
        decision: "drop",
      },
    ]),
    rationale:
      "保留Q2：对象、行为与可测结果清晰；放弃Q1过宽、Q3偏立场。人工修改：去掉单一产品名并加上「教师允许使用」情境。",
    final:
      "在允许使用生成式AI的本科课程论文写作中，学生在文献综述环节采用的不同提示词策略，如何影响其引用准确性与虚假引用（幻觉）发生率？",
  },
};

/** Journal decision also benefits from compare table */
const JOURNAL_DECISION_TYPED: TypedTaskDefinition = {
  id: "journal-decision",
  title: "期刊匹配与投稿决策",
  description: "比较期刊范围、费用、周期和风险，形成可解释的投稿选择。",
  agent: "submit",
  dimension: "ai-literacy",
  requiresReview: false,
  steps: [
    { id: "theme", type: "free_text", title: "明确稿件主题", minChars: 20 },
    {
      id: "compare",
      type: "compare_table",
      title: "比较三个期刊",
      rows: 3,
      columns: ["candidate", "novelty", "value", "feasibility", "decision"],
    },
    { id: "verify", type: "free_text", title: "核对官网要求", minChars: 20 },
    {
      id: "final",
      type: "final_statement",
      title: "说明最终选择",
      minChars: 15,
      enableFinalChecks: false,
    },
  ],
};

// Build a typed definition from an MVP task using free_text steps keyed by ids.
function freeTextTask(
  def: TrainingTaskDefinition,
  ids: string[],
  extra?: Partial<Record<string, Partial<TypedStepDef>>>
): TypedTaskDefinition {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    agent: def.agent,
    dimension: def.dimension,
    requiresReview: def.requiresReview,
    steps: def.steps.map((title, i) => {
      const id = ids[i] ?? `s${i}`;
      const base: TypedStepDef = {
        id,
        type: "free_text",
        title,
        minChars: def.stepMinChars?.[i] ?? 20,
      };
      return { ...base, ...extra?.[id] };
    }),
  };
}

// Typed task definitions keyed by builtin task id.
const TYPED_BY_ID: Record<string, TypedTaskDefinition> = {
  "research-question": RESEARCH_QUESTION_TYPED,
  "journal-decision": JOURNAL_DECISION_TYPED,
  "retrieval-query": freeTextTask(
    MVP_TRAINING_TASKS.find((t) => t.id === "retrieval-query")!,
    ["concepts", "synonyms", "query", "adjust"]
  ),
  "evidence-verification": freeTextTask(
    MVP_TRAINING_TASKS.find((t) => t.id === "evidence-verification")!,
    ["claims", "bind", "strength", "revise"],
    {
      bind: { type: "evidence_bind", minChars: 10 },
    }
  ),
  "research-design": freeTextTask(
    MVP_TRAINING_TASKS.find((t) => t.id === "research-design")!,
    ["method", "variables", "sample", "feasibility"]
  ),
  "data-governance": freeTextTask(
    MVP_TRAINING_TASKS.find((t) => t.id === "data-governance")!,
    ["source", "privacy", "copyright", "redaction"]
  ),
  "responsible-writing": freeTextTask(
    MVP_TRAINING_TASKS.find((t) => t.id === "responsible-writing")!,
    ["structure", "ai_role", "factcheck", "author_edit"],
    {
      author_edit: { type: "diff_note", minChars: 20 },
    }
  ),
  "rebuttal-action": freeTextTask(
    MVP_TRAINING_TASKS.find((t) => t.id === "rebuttal-action")!,
    ["classify", "actions", "evidence", "confirm"]
  ),
};

/** Resolve a typed task by id, falling back to a legacy conversion. */
export function getTypedTaskDefinition(
  taskId: string
): TypedTaskDefinition | undefined {
  if (TYPED_BY_ID[taskId]) return TYPED_BY_ID[taskId];
  const legacy = MVP_TRAINING_TASKS.find((t) => t.id === taskId);
  return legacy ? legacyToTyped(legacy) : undefined;
}

/** Every MVP task resolved to its typed definition. */
export function listTypedTaskDefinitions(): TypedTaskDefinition[] {
  return MVP_TRAINING_TASKS.map(
    (t) => getTypedTaskDefinition(t.id) ?? legacyToTyped(t)
  );
}

/** Agent run ids stored inside answers without schema migration */
export const AGENT_RUN_IDS_KEY = "__agentRunIds";

/** Read the agent run ids stored inside a submission's answers. */
export function parseAgentRunIds(answers: Record<string, string>): string[] {
  const raw = answers[AGENT_RUN_IDS_KEY];
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Return answers with one more unique agent run id recorded. */
export function withAgentRunId(
  answers: Record<string, string>,
  runId: string
): Record<string, string> {
  const ids = new Set(parseAgentRunIds(answers));
  ids.add(runId);
  return {
    ...answers,
    [AGENT_RUN_IDS_KEY]: JSON.stringify(Array.from(ids)),
  };
}

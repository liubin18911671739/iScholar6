/**
 * Training Task Registry (lib/training/registry.ts)
 *
 * Functionality:
 * - Declares `TrainingTaskDefinition`, the base shape for built-in training tasks.
 * - Ships `MVP_TRAINING_TASKS`, the static eight-task MVP curriculum.
 * - Resolves a built-in definition by id via `getTrainingTaskDefinition`.
 *
 * Notes:
 * - Consumed by the catalog, progress, and step-type modules as the builtin source.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { AgentId } from "@/lib/ai/agents/registry";
import type { TrainingDimension } from "@/lib/local/db";

/** Definition of a single built-in training task. */
export interface TrainingTaskDefinition {
  id: string;
  title: string;
  description: string;
  agent: AgentId;
  dimension: TrainingDimension;
  steps: string[];
  requiresReview: boolean;
  /** Per-step minimum characters for completion (index-aligned with steps). */
  stepMinChars?: number[];
}

// Default per-step minimum characters for tasks without explicit overrides.
const DEFAULT_MIN = [20, 20, 20, 20];

/** The eight built-in MVP training tasks, in curriculum order. */
export const MVP_TRAINING_TASKS: TrainingTaskDefinition[] = [
  {
    id: "research-question",
    title: "从兴趣到可检索研究问题",
    description: "比较三个候选问题，说明新颖性、价值和可行性，并完成一次人工修改。",
    agent: "topic",
    dimension: "critical-evaluation",
    steps: ["明确研究对象和场景", "比较三个候选问题", "填写保留或放弃理由", "提交最终研究问题"],
    requiresReview: false,
    stepMinChars: [30, 40, 30, 20],
  },
  {
    id: "retrieval-query",
    title: "从关键词到多语言检索式",
    description: "将研究问题拆分为核心概念，并生成中英文关键词、同义词和检索式。",
    agent: "litreview",
    dimension: "ai-literacy",
    steps: ["拆分核心概念", "补充英文和同义词", "生成检索式", "记录检索调整理由"],
    requiresReview: false,
    stepMinChars: DEFAULT_MIN,
  },
  {
    id: "evidence-verification",
    title: "AI 输出与文献证据核验",
    description: "逐句判断 AI 陈述是否有来源支持，并绑定原文证据。",
    agent: "litreview",
    dimension: "critical-evaluation",
    steps: ["标记需要核验的陈述", "绑定文献和原文", "判断证据强度", "修改无依据结论"],
    requiresReview: true,
    stepMinChars: DEFAULT_MIN,
  },
  {
    id: "research-design",
    title: "把问题转成研究设计",
    description: "选择方法、变量或材料、样本和限制，并说明可行性。",
    agent: "design",
    dimension: "critical-evaluation",
    steps: ["选择研究方法", "定义变量或材料", "说明样本与限制", "解释可行性"],
    requiresReview: true,
    stepMinChars: DEFAULT_MIN,
  },
  {
    id: "data-governance",
    title: "数据、版权与隐私判断",
    description: "判断数据是否可以上传、共享和分析，形成脱敏与授权清单。",
    agent: "data",
    dimension: "data-governance",
    steps: ["说明数据来源", "识别隐私风险", "识别版权风险", "制定脱敏方案"],
    requiresReview: true,
    stepMinChars: DEFAULT_MIN,
  },
  {
    id: "responsible-writing",
    title: "负责任的学术写作",
    description: "使用 AI 辅助结构组织，同时保留作者论证和修改责任。",
    agent: "write",
    dimension: "academic-ethics",
    steps: ["选择段落结构", "标记 AI 参与环节", "完成事实核验", "填写作者修改说明"],
    requiresReview: true,
    stepMinChars: DEFAULT_MIN,
  },
  {
    id: "journal-decision",
    title: "期刊匹配与投稿决策",
    description: "比较期刊范围、费用、周期和风险，形成可解释的投稿选择。",
    agent: "submit",
    dimension: "ai-literacy",
    steps: ["明确稿件主题", "比较三个期刊", "核对官网要求", "说明最终选择"],
    requiresReview: false,
    stepMinChars: DEFAULT_MIN,
  },
  {
    id: "rebuttal-action",
    title: "审稿意见转为修改行动",
    description: "区分合理意见、误解和不可接受要求，形成逐条回复。",
    agent: "rebuttal",
    dimension: "collaboration",
    steps: ["分类审稿意见", "制定修改行动", "绑定证据或位置", "完成作者确认"],
    requiresReview: true,
    stepMinChars: DEFAULT_MIN,
  },
];

/** Look up a built-in training task by id. */
export function getTrainingTaskDefinition(id: string) {
  return MVP_TRAINING_TASKS.find((task) => task.id === id);
}

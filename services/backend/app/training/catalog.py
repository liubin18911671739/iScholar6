"""Built-in MVP training task catalog (port of ``lib/training/registry.ts``)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TaskDefinition:
    """Definition of a single built-in training task."""

    id: str
    title: str
    description: str
    agent: str
    dimension: str
    steps: tuple[str, ...]
    requires_review: bool


# The eight built-in MVP training tasks, in curriculum order.
BUILTIN_TASKS: tuple[TaskDefinition, ...] = (
    TaskDefinition(
        "research-question",
        "从兴趣到可检索研究问题",
        "比较三个候选问题，说明新颖性、价值和可行性，并完成一次人工修改。",
        "topic",
        "critical-evaluation",
        ("明确研究对象和场景", "比较三个候选问题", "填写保留或放弃理由", "提交最终研究问题"),
        False,
    ),
    TaskDefinition(
        "retrieval-query",
        "从关键词到多语言检索式",
        "将研究问题拆分为核心概念，并生成中英文关键词、同义词和检索式。",
        "litreview",
        "ai-literacy",
        ("拆分核心概念", "补充英文和同义词", "生成检索式", "记录检索调整理由"),
        False,
    ),
    TaskDefinition(
        "evidence-verification",
        "AI 输出与文献证据核验",
        "逐句判断 AI 陈述是否有来源支持，并绑定原文证据。",
        "litreview",
        "critical-evaluation",
        ("标记需要核验的陈述", "绑定文献和原文", "判断证据强度", "修改无依据结论"),
        True,
    ),
    TaskDefinition(
        "research-design",
        "把问题转成研究设计",
        "选择方法、变量或材料、样本和限制，并说明可行性。",
        "design",
        "critical-evaluation",
        ("选择研究方法", "定义变量或材料", "说明样本与限制", "解释可行性"),
        True,
    ),
    TaskDefinition(
        "data-governance",
        "数据、版权与隐私判断",
        "判断数据是否可以上传、共享和分析，形成脱敏与授权清单。",
        "data",
        "data-governance",
        ("说明数据来源", "识别隐私风险", "识别版权风险", "制定脱敏方案"),
        True,
    ),
    TaskDefinition(
        "responsible-writing",
        "负责任的学术写作",
        "使用 AI 辅助结构组织，同时保留作者论证和修改责任。",
        "write",
        "academic-ethics",
        ("选择段落结构", "标记 AI 参与环节", "完成事实核验", "填写作者修改说明"),
        True,
    ),
    TaskDefinition(
        "journal-decision",
        "期刊匹配与投稿决策",
        "比较期刊范围、费用、周期和风险，形成可解释的投稿选择。",
        "submit",
        "ai-literacy",
        ("明确稿件主题", "比较三个期刊", "核对官网要求", "说明最终选择"),
        False,
    ),
    TaskDefinition(
        "rebuttal-action",
        "审稿意见转为修改行动",
        "区分合理意见、误解和不可接受要求，形成逐条回复。",
        "rebuttal",
        "collaboration",
        ("分类审稿意见", "制定修改行动", "绑定证据或位置", "完成作者确认"),
        True,
    ),
)

_BY_ID = {task.id: task for task in BUILTIN_TASKS}


def get_task(task_id: str) -> TaskDefinition | None:
    """Look up a built-in training task by id."""
    return _BY_ID.get(task_id)


def task_title(task_id: str) -> str:
    """Title for a task id, falling back to the id itself."""
    task = _BY_ID.get(task_id)
    return task.title if task else task_id


def mvp_task_ids() -> list[str]:
    """Ordered ids of the built-in MVP training tasks."""
    return [task.id for task in BUILTIN_TASKS]

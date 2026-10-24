"""research-plan workflow — multi-agent collaboration graph.

One durable run coordinates three specialist steps (topic → literature →
design) with a quality gate, bounded revisions, and two operator approvals:

    intake → topic → gate(topic) → litreview → design → quality
                       │ abort                     │ verdict
                       ▼                           ├ revise (≤MAX) → design/litreview again
                      END                          └ pass/blocked → summary → gate(final) → END

Steps reuse the built-in agents' prompts, schemas, and artifact kinds so
internal drafts feed the existing approved-artifact context chain once the
final gate approves them. All side effects go through the harness. The human
gates are the only interrupts: internal steps run unattended.
"""

from __future__ import annotations

import json
import re
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.agents.graphs._common import AgentGraphConfig, finalize_structured, run_agent_draft
from app.agents.harness import AgentHarness
from app.agents.model import get_model
from app.agents.prompts import SYSTEM_PROMPTS, build_user_prompt
from app.models import Evidence, RunEvent

WORKFLOW_VERSION = "research-plan/1"

# A blocked-findings revision loop is bounded: each step may be re-run once.
MAX_REVISIONS = 1

JSON_FENCE = re.compile(r"```json\s*\n([\s\S]*?)\n```")

# step name → (role agent id, artifact kind, allowed tools)
STEP_SPECS: dict[str, tuple[str, str, list[str]]] = {
    "topic": ("topic", "topic_proposal", ["scholar.search"]),
    "litreview": ("litreview", "literature_brief", ["scholar.search"]),
    "design": ("design", "research_design", []),
}

QUALITY_SYSTEM_PROMPT = """You are the ResearchPlan quality gate for iScholar.

Review the selected topic, the literature evidence, and the research design as
a whole. Judge: (1) does the evidence support the proposed research question;
(2) are the hypotheses and variables concrete and aligned with the topic;
(3) feasibility risks. Reply with markdown analysis and end with one ```json
block:
```json
{"verdict": "pass" | "revise" | "blocked",
 "issues": [{"step": "topic" | "litreview" | "design", "severity": "high" | "medium" | "low", "note": "..."}]}
```"""

SUMMARY_SYSTEM_PROMPT = """You are the ResearchPlan synthesizer for iScholar.

Write the final research plan in the caller's language: research question,
background and evidence summary, hypotheses, method and analysis outline,
feasibility risks, and open materials the researcher must still provide.
Caveats from quality findings must be stated explicitly. Do not invent papers
or data that the evidence did not establish. Distinguish retrieved source records
from model-written paper summaries. Never claim a systematic review or complete
real-time search unless the run has verified that evidence and protocol."""

LITERATURE_EVIDENCE_NOTICE = """Evidence reporting rules:
- Report only the retrieved source records as search results. Do not invent citations, DOIs, years, venues, or a number of included studies.
- Do not state a total number of included papers in the narrative; the application appends the separately computed source and structured-entry counts.
- If retrieval was incomplete or failed, state that this is not a completed systematic review and that every citation requires verification.
- Keep the count of structured output entries separate from the count of retrieved source records; derive each count from its own list. Neither is a verified count of included studies.
- Write the notice and the whole output in the requested language.
"""


class QualityIssue(BaseModel):
    step: str = "design"
    severity: str = "medium"
    note: str = ""


class QualityFindings(BaseModel):
    verdict: str = Field(default="pass")
    issues: list[QualityIssue] = Field(default_factory=list)


class WorkflowAgentState(TypedDict, total=False):
    goal: str
    project_id: str
    agent: str
    input: dict[str, Any]
    training_task_id: str | None
    program_id: str | None
    mode: str | None
    selected_topic: str | None
    topic_result: dict[str, Any]
    litreview_result: dict[str, Any]
    design_result: dict[str, Any]
    steps: list[dict[str, Any]]
    quality: dict[str, Any]
    revisions: int
    revision_note: str | None
    aborted: bool
    approval: dict[str, Any]
    final: dict[str, Any]


CONFIG = AgentGraphConfig(
    agent="research-plan",
    artifact_kind="research_plan",
    allowed_tools=["scholar.search"],
    context_kinds=[],
)


def _parse_quality(text: str) -> QualityFindings:
    matches = JSON_FENCE.findall(text or "")
    if matches:
        try:
            parsed = json.loads(matches[-1].strip())
            if isinstance(parsed, dict):
                return QualityFindings.model_validate(parsed)
        except Exception:
            pass
    return QualityFindings(verdict="blocked", issues=[QualityIssue(step="design", severity="high", note="quality verdict unparseable")])


def _workflow_language(agent_input: dict[str, Any], goal: str = "") -> str:
    """Resolve explicit language preferences, or infer ``auto`` from the request."""
    requested = str(agent_input.get("language") or "auto").lower()
    if requested.startswith("zh"):
        return "zh"
    if requested.startswith("en"):
        return "en"
    source = " ".join(
        str(value or "") for value in (agent_input.get("researchGoal"), agent_input.get("userPrompt"), goal)
    )
    return "zh" if re.search(r"[\u3400-\u9fff]", source) else "en"


async def _deterministic_issues(harness: AgentHarness, state: WorkflowAgentState) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    litreview = state.get("litreview_result") or {}
    design = state.get("design_result") or {}
    if not (litreview.get("structured") or {}).get("papers"):
        issues.append({"step": "litreview", "severity": "medium", "note": "no literature papers extracted"})
    if not (design.get("structured") or {}).get("hypotheses"):
        issues.append({"step": "design", "severity": "high", "note": "no testable hypotheses"})
    evidence_count = int(
        await harness.session.scalar(
            select(func.count()).select_from(Evidence).where(Evidence.run_id == harness.run_id)
        )
        or 0
    )
    if evidence_count == 0:
        issues.append({"step": "litreview", "severity": "high", "note": "no evidence persisted from searches"})
    return issues


def build(harness: AgentHarness):
    """Build the research-plan workflow graph bound to the given harness."""

    async def run_step(state: WorkflowAgentState, step: str) -> dict[str, Any]:
        role, kind, tools = STEP_SPECS[step]
        await harness.emit("step.started", {"step": step, "role": role, "workflow": WORKFLOW_VERSION})
        agent_input = dict(state.get("input", {}) or {})
        context = _step_context(state, step, agent_input.get("revisionNote") or state.get("revision_note"))
        language = _workflow_language(agent_input, str(state.get("goal") or ""))
        directive = ""
        if language == "zh":
            directive = "重要提示：所有输出内容必须为中文。\n\n"
        elif language == "en":
            directive = "Important: write all output in English.\n\n"
        system = directive + (LITERATURE_EVIDENCE_NOTICE if step == "litreview" else "") + SYSTEM_PROMPTS[role]
        user = build_user_prompt(role, agent_input, context)
        result, tool_results = await run_agent_draft(harness, get_model(role), system, user, tools)
        structured = await finalize_structured(harness, get_model(role), role, system, result)
        display_text = result.text
        evidence_metadata: dict[str, Any] | None = None
        if step == "litreview":
            retrieved_count = sum(1 for item in tool_results if item.get("title") and item.get("url"))
            failed_searches = int(
                await harness.session.scalar(
                    select(func.count()).select_from(RunEvent).where(
                        RunEvent.run_id == harness.run_id,
                        RunEvent.type == "tool.failed",
                        RunEvent.data["name"].as_string() == "scholar.search",
                    )
                ) or 0
            )
            structured_papers = (structured or {}).get("papers") or []
            retrieval_status = (
                "no_sources" if retrieved_count == 0 else "partial" if failed_searches else "tool_calls_succeeded"
            )
            evidence_metadata = {
                "retrievedSourceCount": retrieved_count,
                "structuredEntryCount": len(structured_papers),
                "failedSearchCount": failed_searches,
                "retrievalStatus": retrieval_status,
                "claimBoundary": "retrieved_sources_only; model summaries require citation verification",
            }
            if language == "zh":
                display_text += (
                    f"\n\n> 检索说明：本次工具返回 {retrieved_count} 条来源记录，"
                    f"结构化列表包含 {len(structured_papers)} 条生成条目。"
                    + (f"检索失败 {failed_searches} 次。" if failed_searches else "")
                    + "这不代表已完成实时系统综述，也不是已纳入研究的核实数量；正文若出现其他纳入数，均需核验。引用与 DOI 请逐项核查。"
                )
            else:
                display_text += (
                    f"\n\n> Retrieval note: tools returned {retrieved_count} source records; "
                    f"the structured list contains {len(structured_papers)} generated entries."
                    + (f" Searches failed {failed_searches} times." if failed_searches else "")
                    + " This is not a completed systematic review or a verified included-study count. Verify any different narrative total, citations, and DOIs individually."
                )
        content: dict[str, Any] = {
            "text": display_text,
            "structured": structured,
            "sources": tool_results,
            "usage": {"tokenIn": harness.token_in, "tokenOut": harness.token_out},
        }
        if evidence_metadata:
            content["evidence"] = evidence_metadata
        artifact = await harness.save_draft(
            str(state.get("project_id") or ""), kind, content, logical_key=f"research-plan:{step}"
        )
        await harness.emit(
            "step.completed",
            {"step": step, "role": role, "kind": kind, "artifactId": str(artifact.id)},
        )
        entry = {"step": step, "role": role, "kind": kind, "artifactId": str(artifact.id), "text": display_text[:4000]}
        step_result = {"text": display_text, "structured": structured}
        if evidence_metadata:
            step_result["evidence"] = evidence_metadata
        updates: dict[str, Any] = {f"{role}_result": step_result, "steps": [*(state.get("steps") or []), entry]}
        if step == "topic":
            topic = (structured or {}).get("topics") or []
            if topic:
                updates["selected_topic"] = topic[0].get("title")
        return updates

    async def intake(state: WorkflowAgentState) -> dict[str, Any]:
        await harness.emit("workflow.started", {"workflow": WORKFLOW_VERSION, "goal": str(state.get("goal") or "")})
        return {"steps": [], "revisions": 0, "aborted": False}

    async def topic_step(state: WorkflowAgentState) -> dict[str, Any]:
        return await run_step(state, "topic")

    async def gate_topic(state: WorkflowAgentState) -> dict[str, Any]:
        decision = interrupt(
            {
                "kind": "workflow_gate",
                "stage": "topic",
                "message": "Select a research direction before literature and design work begins.",
                "proposal": state.get("topic_result"),
                "selected": state.get("selected_topic"),
            }
        )
        approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
        if not approved:
            return {"aborted": True, "approval": {"approved": False}, "selected_topic": state.get("selected_topic")}
        selected = decision.get("selected") if isinstance(decision, dict) else None
        return {
            "aborted": False,
            "approval": {},
            "selected_topic": selected.strip() if isinstance(selected, str) and selected.strip() else state.get("selected_topic"),
        }

    async def litreview_step(state: WorkflowAgentState) -> dict[str, Any]:
        return await run_step(state, "litreview")

    async def design_step(state: WorkflowAgentState) -> dict[str, Any]:
        return await run_step(state, "design")

    async def quality_check(state: WorkflowAgentState) -> dict[str, Any]:
        await harness.emit("step.started", {"step": "quality"})
        await harness.check_model_budget()
        language = _workflow_language(state.get("input") or {}, str(state.get("goal") or ""))
        directive = "重要提示：所有分析与 JSON 字段值必须使用中文。\n\n" if language == "zh" else "Important: write all analysis and JSON values in English.\n\n" if language == "en" else ""
        system = directive + QUALITY_SYSTEM_PROMPT
        user = _quality_prompt(state)
        result = await harness.stream_model(get_model("quality"), system, user)
        findings = _parse_quality(result.text)
        issues = [
            *findings.issues,
            *(QualityIssue.model_validate(issue) for issue in await _deterministic_issues(harness, state)),
        ]
        quality = {"verdict": findings.verdict, "issues": [issue.model_dump() for issue in issues]}
        await harness.emit(
            "step.completed",
            {"step": "quality", "verdict": quality["verdict"], "issues": quality["issues"]},
        )
        return {"quality": quality}

    def route_after_quality(state: WorkflowAgentState) -> str:
        verdict = (state.get("quality") or {}).get("verdict", "pass")
        if verdict == "revise" and int(state.get("revisions") or 0) < MAX_REVISIONS:
            return "revise"
        return "summarize"

    async def revise(state: WorkflowAgentState) -> dict[str, Any]:
        issues = (state.get("quality") or {}).get("issues") or []
        target = next((issue.get("step") for issue in issues if issue.get("step") in STEP_SPECS), "design")
        note = "; ".join(str(issue.get("note") or "") for issue in issues)[:2000]
        updates = await run_step({**state, "revision_note": note}, target)
        return {**updates, "revisions": int(state.get("revisions") or 0) + 1}

    async def summarize(state: WorkflowAgentState) -> dict[str, Any]:
        await harness.emit("step.started", {"step": "summary"})
        await harness.check_model_budget()
        language = _workflow_language(state.get("input") or {}, str(state.get("goal") or ""))
        directive = "重要提示：最终方案必须使用中文。\n\n" if language == "zh" else "Important: write the final plan in English.\n\n" if language == "en" else ""
        system = directive + SUMMARY_SYSTEM_PROMPT
        user = _summary_prompt(state)
        result = await harness.stream_model(get_model("summary"), system, user)
        summary_text = result.text
        literature_evidence = (state.get("litreview_result") or {}).get("evidence") or {}
        if language == "zh":
            summary_text += (
                "\n\n> 文献证据边界：本方案不是已完成的实时系统综述。"
                f"检索工具返回 {literature_evidence.get('retrievedSourceCount', 0)} 条来源记录；"
                "请逐项核验引用与 DOI。"
            )
        else:
            summary_text += (
                "\n\n> Literature evidence boundary: this plan is not a completed real-time systematic review. "
                f"Search tools returned {literature_evidence.get('retrievedSourceCount', 0)} source records; "
                "verify each citation and DOI."
            )
        content: dict[str, Any] = {
            "text": summary_text,
            "workflow": WORKFLOW_VERSION,
            "quality": state.get("quality"),
            "selectedTopic": state.get("selected_topic"),
            "usage": {"tokenIn": harness.token_in, "tokenOut": harness.token_out},
        }
        artifact = await harness.save_draft(
            str(state.get("project_id") or ""), CONFIG.artifact_kind, content, logical_key="research-plan:summary"
        )
        await harness.emit("step.completed", {"step": "summary", "kind": CONFIG.artifact_kind, "artifactId": str(artifact.id)})
        return {"final": {**content, "artifactId": str(artifact.id)}}

    async def gate_final(state: WorkflowAgentState) -> dict[str, Any]:
        decision = interrupt(
            {
                "kind": "workflow_gate",
                "stage": "final",
                "message": "Review the research plan before it is applied to the project.",
                "plan": state.get("final"),
                "quality": state.get("quality"),
            }
        )
        approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
        return {"approval": {"approved": approved}}

    async def aborted(state: WorkflowAgentState) -> dict[str, Any]:
        await harness.emit("workflow.aborted", {"stage": "topic"})
        return {"final": None, "aborted": True}

    builder = StateGraph(WorkflowAgentState)
    builder.add_node("intake", intake)
    builder.add_node("topic", topic_step)
    builder.add_node("gate_topic", gate_topic)
    builder.add_node("litreview", litreview_step)
    builder.add_node("design", design_step)
    builder.add_node("quality", quality_check)
    builder.add_node("revise", revise)
    builder.add_node("summarize", summarize)
    builder.add_node("gate_final", gate_final)
    builder.add_node("aborted", aborted)

    builder.add_edge(START, "intake")
    builder.add_edge("intake", "topic")
    builder.add_edge("topic", "gate_topic")
    builder.add_conditional_edges(
        "gate_topic", lambda s: "aborted" if s.get("aborted") else "litreview", {"aborted": "aborted", "litreview": "litreview"}
    )
    builder.add_edge("litreview", "design")
    builder.add_edge("design", "quality")
    builder.add_conditional_edges("quality", route_after_quality, {"revise": "revise", "summarize": "summarize"})
    builder.add_edge("revise", "quality")
    builder.add_edge("summarize", "gate_final")
    builder.add_edge("gate_final", END)
    builder.add_edge("aborted", END)
    return builder


def _step_context(state: WorkflowAgentState, step: str, revision_note: str | None) -> str:
    """Build the specialist step's context from explicit upstream results."""
    parts: list[str] = []
    if step == "litreview":
        topic = state.get("topic_result") or {}
        structured = structured_text(topic.get("structured"))
        selected = state.get("selected_topic")
        if selected:
            parts.append(f"Selected research direction: {selected}")
        if structured:
            parts.append(f"Topic analysis:\n{structured[:1500]}")
    elif step == "design":
        topic = state.get("topic_result") or {}
        brief = state.get("litreview_result") or {}
        selected = state.get("selected_topic")
        if selected:
            parts.append(f"Selected research direction: {selected}")
        brief_structured = structured_text(brief.get("structured"))
        if brief_structured:
            parts.append(f"Literature brief:\n{brief_structured[:1500]}")
    if revision_note:
        parts.append(f"Quality findings to address in this revision: {revision_note}")
    return "\n\n".join(parts)


def structured_text(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return ""


def _quality_prompt(state: WorkflowAgentState) -> str:
    goal = state.get("goal", "")
    topic = state.get("selected_topic") or "not selected"
    design = state.get("design_result") or {}
    brief = state.get("litreview_result") or {}
    return (
        f"Research goal: {goal}\n"
        f"Selected topic: {topic}\n"
        f"Literature summary: {structured_text(brief.get('structured'))[:2500] or brief.get('text', '')[:2500]}\n"
        f"Literature evidence metadata: {json.dumps(brief.get('evidence') or {}, ensure_ascii=False)}\n"
        f"Research design: {structured_text(design.get('structured'))[:2500] or design.get('text', '')[:2500]}\n"
    )


def _summary_prompt(state: WorkflowAgentState) -> str:
    quality = state.get("quality") or {}
    return _quality_prompt(state) + (
        f"Quality findings (repeat these caveats explicitly): verdict={quality.get('verdict')}; "
        f"issues={json.dumps(quality.get('issues') or [], ensure_ascii=False)}\n"
    )

"""The research orchestration graph.

It starts with a deliberately narrow, real vertical slice: a goal triggers a
literature search, stores evidence, drafts a review and pauses for approval.
The same state and harness are used by specialised agents so more subgraphs can
be added without creating an alternate execution path.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from app.agents.harness import AgentHarness


class ResearchState(TypedDict, total=False):
    goal: str
    project_id: str
    agent: str
    evidence: list[dict[str, Any]]
    draft: dict[str, Any]
    approval: dict[str, Any]


def build_graph(harness: AgentHarness):
    async def plan(state: ResearchState) -> dict[str, Any]:
        await harness.emit("plan.created", {"agent": state.get("agent", "orchestrator"), "goal": state["goal"]})
        return {}

    async def research(state: ResearchState) -> dict[str, Any]:
        if state.get("agent") not in {"orchestrator", "topic", "litreview"}:
            return {"evidence": []}
        evidence = await harness.call_tool("scholar.search", query=state["goal"])
        await harness.persist_evidence(evidence)
        return {"evidence": evidence}

    async def draft(state: ResearchState) -> dict[str, Any]:
        sources = state.get("evidence", [])
        citations = [f"- {item['title']} ({item.get('url', '')})" for item in sources]
        content = {
            "title": f"Research brief: {state['goal']}",
            "body": "## Evidence-backed literature brief\n\n" + ("\n".join(citations) or "No sources were returned."),
            "sources": sources,
            "limitations": ["This is a draft; source claims require researcher review."],
        }
        kinds = {"topic": "topic_proposal", "litreview": "literature_brief", "design": "research_design", "data": "analysis_plan", "write": "manuscript_draft", "submit": "journal_shortlist", "rebuttal": "rebuttal_draft"}
        artifact = await harness.save_draft(state["project_id"], kinds.get(state.get("agent", ""), "literature_brief"), content)
        return {"draft": {**content, "artifactId": str(artifact.id)}}

    async def review(state: ResearchState) -> dict[str, Any]:
        # No protected write occurs before this pause. Nodes may be replayed,
        # so all writes before it are idempotent in the harness.
        decision = interrupt({"kind": "artifact_review", "artifact": state["draft"], "message": "Review and approve the draft before publishing it."})
        return {"approval": decision}

    builder = StateGraph(ResearchState)
    builder.add_node("plan", plan)
    builder.add_node("research", research)
    builder.add_node("draft", draft)
    builder.add_node("review", review)
    builder.add_edge(START, "plan")
    builder.add_edge("plan", "research")
    builder.add_edge("research", "draft")
    builder.add_edge("draft", "review")
    builder.add_edge("review", END)
    return builder

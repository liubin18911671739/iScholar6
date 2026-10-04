"""Execution policy shared by every graph.

The harness owns durable product events, budgets, tool permissions and
idempotent artifact writes. Graph nodes may ask it to act; they do not write
domain records directly.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.model import AgentModel, ModelResult
from app.core.events import next_run_sequence
from app.mcp.plugin_tools import PluginToolDef, execute_plugin_tool
from app.mcp.registry import registry
from app.models import AgentRun, Artifact, Evidence, RunEvent, RunStatus


class HarnessError(RuntimeError):
    pass


class RunCancelled(HarnessError):
    pass


@dataclass
class AgentHarness:
    session: AsyncSession
    run_id: str
    allowed_tools: set[str]
    max_tool_calls: int = 8
    # Owner-scoped declarative plugin tools resolved for this run (not global).
    plugin_tools: dict[str, PluginToolDef] = field(default_factory=dict)

    async def emit(self, event_type: str, data: dict[str, Any]) -> None:
        sequence = await next_run_sequence(self.session, self.run_id)
        self.session.add(RunEvent(run_id=self.run_id, sequence=sequence, type=event_type, data=data))
        await self.session.flush()

    async def ensure_active(self) -> None:
        cancelled = await self.session.scalar(select(AgentRun.cancel_requested).where(AgentRun.id == self.run_id))
        if cancelled:
            run = await self.session.get(AgentRun, self.run_id)
            if run:
                run.status = RunStatus.CANCELLED
            raise RunCancelled("RUN_CANCELLED")

    async def call_tool(self, name: str, **arguments: Any) -> Any:
        await self.ensure_active()
        plugin_tool = self.plugin_tools.get(name)
        if name not in self.allowed_tools or (plugin_tool is None and registry.get(name) is None):
            raise HarnessError(f"TOOL_NOT_ALLOWED: {name}")
        count = await self.session.scalar(select(func.count()).select_from(RunEvent).where(RunEvent.run_id == self.run_id, RunEvent.type == "tool.completed"))
        if count >= self.max_tool_calls:
            raise HarnessError("TOOL_BUDGET_EXCEEDED")
        await self.emit("tool.started", {"name": name, "arguments": arguments})
        try:
            if plugin_tool is not None:
                result = await execute_plugin_tool(plugin_tool, dict(arguments))
            else:
                result = await registry.call(name, arguments)
            await self.ensure_active()
        except Exception as exc:
            await self.emit("tool.failed", {"name": name, "error": str(exc)})
            raise HarnessError(f"TOOL_FAILED: {name}") from exc
        await self.emit("tool.completed", {"name": name, "resultCount": len(result) if isinstance(result, list) else 1})
        return result

    async def emit_text_deltas(self, text: str, *, chunk_size: int = 160, event_type: str = "message.delta") -> None:
        """Emit a model answer as incremental ``message.delta`` events."""
        for index in range(0, len(text), chunk_size):
            await self.emit(event_type, {"text": text[index : index + chunk_size]})

    async def stream_model(
        self,
        model: AgentModel,
        system: str,
        user: str,
        *,
        chunk_size: int = 160,
        event_type: str = "message.delta",
    ) -> ModelResult:
        """Stream a model answer, batching tokens into ``message.delta`` events."""
        buffer = ""
        full = ""
        deltas: list[str] = []

        async def on_delta(piece: str) -> None:
            nonlocal buffer, full
            if not piece:
                return
            buffer += piece
            full += piece
            if len(buffer) >= chunk_size:
                deltas.append(buffer)
                buffer = ""

        result = await model.stream(system, user, on_delta)
        if buffer:
            deltas.append(buffer)
        for delta in deltas:
            await self.emit(event_type, {"text": delta})
        text = full or result.text
        return ModelResult(text=text, token_in=result.token_in, token_out=result.token_out)

    async def persist_evidence(self, evidence: list[dict[str, Any]]) -> None:
        for item in evidence:
            if not item.get("title") or not item.get("url"):
                continue
            self.session.add(Evidence(run_id=self.run_id, title=item["title"], source_url=item["url"], doi=item.get("doi"), verified=bool(item.get("doi")), metadata_=item))
        await self.session.flush()

    async def save_draft(self, project_id: str, kind: str, content: dict[str, Any]) -> Artifact:
        await self.ensure_active()
        # Same logical graph output never creates two artifacts on retries.
        payload = json.dumps(content, sort_keys=True, ensure_ascii=False).encode()
        key = hashlib.sha256(f"{self.run_id}:{kind}:".encode() + payload).hexdigest()
        artifact = await self.session.scalar(select(Artifact).where(Artifact.run_id == self.run_id, Artifact.idempotency_key == key))
        if artifact:
            return artifact
        artifact = Artifact(run_id=self.run_id, project_id=project_id, kind=kind, status="draft", content=content, idempotency_key=key)
        self.session.add(artifact)
        await self.session.flush()
        await self.emit("artifact.draft_saved", {"artifactId": str(artifact.id), "kind": kind})
        return artifact

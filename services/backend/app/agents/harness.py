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
from app.mcp.pool import call_remote_tool
from app.mcp.registry import registry
from app.models import AgentRun, Artifact, Evidence, RunEvent, RunStatus

# Model-supplied identity keys are always stripped from ischolar.* tool args;
# the execution context provides the caller identity instead.
_TOOL_IDENTITY_KEYS = ("owner_id", "ownerId")


class HarnessError(RuntimeError):
    pass


class RunCancelled(HarnessError):
    pass


class RunStale(HarnessError):
    """This worker lost the lease (reaped + re-claimed by another worker)."""

    pass


@dataclass
class AgentHarness:
    session: AsyncSession
    run_id: str
    allowed_tools: set[str]
    max_tool_calls: int = 8
    # Lease token issued by claim_next_run; fences this worker's writes.
    lease_token: str | None = None
    # Execution context: identity is injected server-side, never model-supplied.
    owner_id: str | None = None
    project_id: str | None = None
    # Remote MCP tools discovered from configured servers (namespaced names).
    remote_tools: dict[str, Any] = field(default_factory=dict)
    # Model token budget for this run attempt (0 disables the check).
    max_tokens: int = 0
    token_in: int = 0
    token_out: int = 0
    # Owner-scoped declarative plugin tools resolved for this run (not global).
    plugin_tools: dict[str, PluginToolDef] = field(default_factory=dict)

    async def emit(self, event_type: str, data: dict[str, Any]) -> None:
        """Append a run event and commit it immediately.

        Committing per event keeps the SSE stream live while a run executes
        (the events were previously invisible until the whole run committed).
        Domain writes riding the same session (drafts, evidence) become visible
        early as well; every write is idempotent, so a crash mid-run replays
        cleanly.
        """
        sequence = await next_run_sequence(self.session, self.run_id)
        self.session.add(RunEvent(run_id=self.run_id, sequence=sequence, type=event_type, data=data))
        await self.session.commit()

    async def ensure_active(self) -> None:
        """Raise when the run was cancelled or this worker lost its lease."""
        row = (
            await self.session.execute(
                select(AgentRun.status, AgentRun.cancel_requested, AgentRun.lease_token).where(
                    AgentRun.id == self.run_id
                )
            )
        ).first()
        if row is None:
            raise RunStale("RUN_GONE")
        status, cancelled, lease = row
        if cancelled:
            raise RunCancelled("RUN_CANCELLED")
        if status != RunStatus.RUNNING:
            raise RunStale("RUN_NO_LONGER_RUNNING")
        if self.lease_token and lease is not None and str(lease) != self.lease_token:
            raise RunStale("RUN_LEASE_LOST")

    def record_usage(self, token_in: int, token_out: int) -> None:
        """Accumulate model usage for the per-run token budget."""
        self.token_in += token_in
        self.token_out += token_out

    async def check_model_budget(self) -> None:
        """Raise when the run exhausted its model token budget."""
        if self.max_tokens and (self.token_in + self.token_out) >= self.max_tokens:
            raise HarnessError("MODEL_BUDGET_EXCEEDED")

    async def call_tool(self, name: str, **arguments: Any) -> Any:
        await self.ensure_active()
        plugin_tool = self.plugin_tools.get(name)
        remote_tool = self.remote_tools.get(name)
        if name not in self.allowed_tools or (plugin_tool is None and remote_tool is None and registry.get(name) is None):
            raise HarnessError(f"TOOL_NOT_ALLOWED: {name}")
        # Budget counts every attempt (failures consume budget like successes,
        # so a model cannot spin forever on a failing tool).
        count = int(
            await self.session.scalar(
                select(func.count()).select_from(RunEvent).where(RunEvent.run_id == self.run_id, RunEvent.type == "tool.started")
            )
            or 0
        )
        if count >= self.max_tool_calls:
            raise HarnessError("TOOL_BUDGET_EXCEEDED")
        await self.emit("tool.started", {"name": name, "arguments": arguments})
        try:
            if plugin_tool is not None:
                result = await execute_plugin_tool(plugin_tool, dict(arguments))
            elif remote_tool is not None:
                result = await call_remote_tool(remote_tool, dict(arguments))
            else:
                result = await registry.call(name, self._bound_arguments(name, arguments))
            await self.ensure_active()
        except Exception as exc:
            if isinstance(exc, (RunCancelled, RunStale, HarnessError)):
                raise
            await self.emit("tool.failed", {"name": name, "error": str(exc)})
            raise HarnessError(f"TOOL_FAILED: {name}") from exc
        await self.emit("tool.completed", {"name": name, "resultCount": len(result) if isinstance(result, list) else 1})
        return result

    def _bound_arguments(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Bind the execution identity to a tool call; never trust model ids.

        For ``ischolar.*`` domain tools the model-supplied ``owner_id`` is
        stripped and replaced by the run owner, so cross-user access is
        impossible even if the model echoes a foreign id.
        """
        if not name.startswith("ischolar."):
            return arguments
        bound = {key: value for key, value in arguments.items() if key not in _TOOL_IDENTITY_KEYS}
        if self.owner_id:
            bound["owner_id"] = self.owner_id
        return bound

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
        """Stream a model answer, emitting ``message.delta`` as chunks arrive.

        Deltas are committed while the model is still generating, so SSE
        consumers see incremental text instead of a burst after completion.
        Usage is recorded internally, so every model consumer shares the
        per-run token budget.
        """
        buffer = ""
        full = ""
        await self.check_model_budget()

        async def on_delta(piece: str) -> None:
            nonlocal buffer, full
            if not piece:
                return
            buffer += piece
            full += piece
            if len(buffer) >= chunk_size:
                chunk, buffer = buffer, ""
                await self.emit(event_type, {"text": chunk})

        result = await model.stream(system, user, on_delta)
        if buffer:
            await self.emit(event_type, {"text": buffer})
        self.record_usage(result.token_in, result.token_out)
        text = full or result.text
        return ModelResult(text=text, token_in=result.token_in, token_out=result.token_out)

    async def persist_evidence(self, evidence: list[dict[str, Any]]) -> None:
        for item in evidence:
            if not item.get("title") or not item.get("url"):
                continue
            # Crash-replay runs the tool loop again; skip already-persisted
            # sources for this run instead of duplicating evidence rows.
            duplicate = await self.session.scalar(
                select(Evidence.id).where(Evidence.run_id == self.run_id, Evidence.source_url == item["url"]).limit(1)
            )
            if duplicate:
                continue
            self.session.add(Evidence(run_id=self.run_id, title=item["title"], source_url=item["url"], doi=item.get("doi"), verified=bool(item.get("doi")), metadata_=item))
        await self.session.flush()

    async def save_draft(
        self, project_id: str, kind: str, content: dict[str, Any], *, logical_key: str | None = None
    ) -> Artifact:
        await self.ensure_active()
        payload = json.dumps(content, sort_keys=True, ensure_ascii=False).encode()
        # A workflow step has one current artifact across retries. The durable
        # update event retains each attempt's content hash for audit without
        # exposing the generated text in the event stream.
        key_seed = f"{self.run_id}:{kind}:{logical_key}" if logical_key else f"{self.run_id}:{kind}:"
        key = hashlib.sha256(key_seed.encode() + (b"" if logical_key else payload)).hexdigest()
        artifact = await self.session.scalar(select(Artifact).where(Artifact.run_id == self.run_id, Artifact.idempotency_key == key))
        if artifact:
            if logical_key and artifact.content != content:
                prior_payload = json.dumps(artifact.content, sort_keys=True, ensure_ascii=False).encode()
                artifact.content = content
                await self.emit(
                    "artifact.draft_updated",
                    {
                        "artifactId": str(artifact.id),
                        "kind": kind,
                        "logicalKey": logical_key,
                        "previousContentHash": hashlib.sha256(prior_payload).hexdigest(),
                        "contentHash": hashlib.sha256(payload).hexdigest(),
                    },
                )
            return artifact
        artifact = Artifact(run_id=self.run_id, project_id=project_id, kind=kind, status="draft", content=content, idempotency_key=key)
        self.session.add(artifact)
        await self.session.flush()
        await self.emit("artifact.draft_saved", {"artifactId": str(artifact.id), "kind": kind})
        return artifact

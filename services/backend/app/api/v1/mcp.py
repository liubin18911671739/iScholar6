"""MCP REST API (``/v1/mcp``).

Exposes the built-in tool registry to the web BFF: list tools and invoke one
with a signed identity and a recorded redaction consent. The same tools are
available over the MCP transport via ``app.mcp.server``.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel
from app.core.config import get_settings
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.mcp.registry import registry
from app.models import AiConsent

router = APIRouter(prefix="/mcp", tags=["mcp"])

MAX_REQUEST_BYTES = 2 * 1024 * 1024


class ConsentProof(CamelModel):
    consent_id: uuid.UUID


class ToolInvoke(CamelModel):
    project_id: uuid.UUID
    consent_proof: ConsentProof
    params: dict[str, Any] = Field(default_factory=dict)


@router.get("/tools")
async def list_tools(identity: Identity = Depends(require_identity)) -> dict[str, Any]:
    """List the registered MCP tools."""
    del identity
    return {
        "ok": True,
        "data": [
            {"name": tool.name, "description": tool.description, "source": tool.source}
            for tool in registry.list()
        ],
    }


@router.post("/tools/{name}")
async def invoke_tool(
    name: str,
    body: ToolInvoke,
    request: Request,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Invoke an MCP tool after identity, size, and consent checks."""
    settings = get_settings()
    max_bytes = getattr(settings, "mcp_request_max_bytes", MAX_REQUEST_BYTES)
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > max_bytes:
        raise HTTPException(status_code=413, detail="REQUEST_TOO_LARGE")

    tool = registry.get(name)
    if tool is None:
        raise HTTPException(status_code=404, detail="TOOL_NOT_FOUND")

    owner_id = identity_uuid(identity)
    consent = await session.get(AiConsent, body.consent_proof.consent_id)
    if (
        consent is None
        or consent.owner_id != owner_id
        or consent.project_id != body.project_id
        or not consent.redaction_confirmed
    ):
        raise HTTPException(status_code=403, detail="CONSENT_REQUIRED")

    try:
        result = await registry.call(name, body.params)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="TOOL_NOT_FOUND") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"INVALID_PARAMS: {exc}") from exc
    return {"ok": True, "data": result}

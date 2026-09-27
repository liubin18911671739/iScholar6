"""Per-user plugin installs and prompt-pack selections (``/v1/plugins``)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import PluginInstall, PromptPackSelection

router = APIRouter(prefix="/plugins", tags=["plugins"])


class PluginInstallBody(CamelModel):
    id: str = Field(min_length=1, max_length=200)
    version: str = Field(default="1.0.0", max_length=64)
    enabled: bool = True
    manifest: dict[str, Any] = Field(default_factory=dict)
    content_hash: str | None = Field(default=None, max_length=128)


class PromptPackBody(CamelModel):
    pack_ref: str = Field(min_length=1)


def serialize_install(row: PluginInstall) -> dict[str, Any]:
    return {
        "id": row.id,
        "version": row.version,
        "enabled": row.enabled,
        "manifest": row.manifest,
        "contentHash": row.content_hash,
        "installedAt": iso(row.installed_at),
        "updatedAt": iso(row.updated_at),
    }


def serialize_selection(row: PromptPackSelection) -> dict[str, Any]:
    return {"agentId": row.agent_id, "packRef": row.pack_ref, "updatedAt": iso(row.updated_at)}


@router.get("")
async def list_installs(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    """List the caller's installed plugins."""
    owner_id = identity_uuid(identity)
    rows = (
        await session.scalars(
            select(PluginInstall).where(PluginInstall.owner_id == owner_id).order_by(PluginInstall.id)
        )
    ).all()
    return ok([serialize_install(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def upsert_install(
    body: PluginInstallBody,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Install or update a plugin for the caller."""
    owner_id = identity_uuid(identity)
    content_hash = body.content_hash or hashlib.sha256(
        json.dumps(body.manifest, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    row = await session.get(PluginInstall, (body.id, owner_id))
    if row is None:
        row = PluginInstall(
            id=body.id,
            owner_id=owner_id,
            version=body.version,
            enabled=body.enabled,
            manifest=body.manifest,
            content_hash=content_hash,
        )
        session.add(row)
    else:
        row.version = body.version
        row.enabled = body.enabled
        row.manifest = body.manifest
        row.content_hash = content_hash
    await session.commit()
    return ok(serialize_install(row))


@router.delete("/{plugin_id}")
async def uninstall(
    plugin_id: str,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Uninstall a plugin and drop its prompt-pack selections."""
    owner_id = identity_uuid(identity)
    row = await session.get(PluginInstall, (plugin_id, owner_id))
    if row is not None:
        await session.delete(row)
    selections = (
        await session.scalars(select(PromptPackSelection).where(PromptPackSelection.owner_id == owner_id))
    ).all()
    for selection in selections:
        if selection.pack_ref.startswith(f"{plugin_id}/"):
            await session.delete(selection)
    await session.commit()
    return ok({"id": plugin_id})


@router.get("/prompt-packs")
async def list_selections(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    """List the caller's prompt-pack selections."""
    owner_id = identity_uuid(identity)
    rows = (
        await session.scalars(
            select(PromptPackSelection)
            .where(PromptPackSelection.owner_id == owner_id)
            .order_by(PromptPackSelection.agent_id)
        )
    ).all()
    return ok([serialize_selection(row) for row in rows])


@router.put("/prompt-packs/{agent_id}")
async def upsert_selection(
    agent_id: str,
    body: PromptPackBody,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Set the active prompt pack for one agent."""
    owner_id = identity_uuid(identity)
    if body.pack_ref != "builtin" and "/" not in body.pack_ref:
        raise HTTPException(status_code=422, detail="INVALID_PACK_REF")
    row = await session.get(PromptPackSelection, (owner_id, agent_id))
    if row is None:
        row = PromptPackSelection(owner_id=owner_id, agent_id=agent_id, pack_ref=body.pack_ref)
        session.add(row)
    else:
        row.pack_ref = body.pack_ref
    await session.commit()
    return ok(serialize_selection(row))


@router.delete("/prompt-packs/{agent_id}")
async def delete_selection(
    agent_id: str,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Clear the prompt-pack selection for one agent."""
    owner_id = identity_uuid(identity)
    row = await session.get(PromptPackSelection, (owner_id, agent_id))
    if row is not None:
        await session.delete(row)
        await session.commit()
    return ok({"agentId": agent_id})

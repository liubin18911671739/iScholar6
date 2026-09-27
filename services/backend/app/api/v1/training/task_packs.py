"""Training task packs (``/v1/training/task-packs``)."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import global_role
from app.core.authz import is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingTaskDefinition, TrainingTaskPack

router = APIRouter(prefix="/task-packs", tags=["training"])


class TaskDefinitionInput(CamelModel):
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1)
    description: str = ""
    agent: str = Field(min_length=1, max_length=64)
    dimension: str = Field(min_length=1, max_length=64)
    steps: list[Any] = Field(default_factory=list)
    requires_review: bool = False
    peer_review: bool = False


class TaskPackUpsert(CamelModel):
    pack_key: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=400)
    description: str | None = None
    version: str = Field(default="1.0.0", max_length=64)
    source: str = Field(default="upload", max_length=32)
    manifest: dict[str, Any] = Field(default_factory=dict)
    organization_id: uuid.UUID | None = None
    definitions: list[TaskDefinitionInput] = Field(default_factory=list)


def serialize_pack(pack: TrainingTaskPack, definitions: list[TrainingTaskDefinition]) -> dict[str, Any]:
    return {
        "id": str(pack.id),
        "packKey": pack.pack_key,
        "name": pack.name,
        "description": pack.description,
        "version": pack.version,
        "source": pack.source,
        "manifest": pack.manifest,
        "contentHash": pack.content_hash,
        "organizationId": str(pack.organization_id) if pack.organization_id else None,
        "createdAt": iso(pack.created_at),
        "updatedAt": iso(pack.updated_at),
        "definitions": [
            {
                "id": d.id,
                "packId": str(d.pack_id) if d.pack_id else None,
                "title": d.title,
                "description": d.description,
                "agent": d.agent,
                "dimension": d.dimension,
                "steps": d.steps,
                "requiresReview": d.requires_review,
                "peerReview": d.peer_review,
            }
            for d in definitions
        ],
    }


async def _require_staff(session: AsyncSession, user_id: uuid.UUID) -> None:
    if not is_global_staff(await global_role(session, user_id)):
        raise HTTPException(status_code=403, detail="FORBIDDEN")


@router.get("")
async def list_task_packs(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    """List task packs and their definitions (staff only)."""
    user_id = identity_uuid(identity)
    await _require_staff(session, user_id)

    packs = (await session.scalars(select(TrainingTaskPack).order_by(TrainingTaskPack.name))).all()
    definitions = (
        await session.scalars(select(TrainingTaskDefinition).order_by(TrainingTaskDefinition.title))
    ).all()
    by_pack: dict[str, list[TrainingTaskDefinition]] = {}
    for definition in definitions:
        by_pack.setdefault(str(definition.pack_id), []).append(definition)
    return ok([serialize_pack(pack, by_pack.get(str(pack.id), [])) for pack in packs])


@router.post("", status_code=status.HTTP_201_CREATED)
async def upsert_task_pack(
    body: TaskPackUpsert,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Upsert a task pack and replace its definitions (staff only)."""
    user_id = identity_uuid(identity)
    await _require_staff(session, user_id)
    if body.source not in {"builtin", "upload", "plugin"}:
        raise HTTPException(status_code=422, detail="INVALID_SOURCE")

    content_hash = hashlib.sha256(json.dumps(body.manifest, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    pack = await session.scalar(select(TrainingTaskPack).where(TrainingTaskPack.pack_key == body.pack_key))
    if pack is None:
        pack = TrainingTaskPack(
            pack_key=body.pack_key,
            name=body.name,
            description=body.description,
            version=body.version,
            source=body.source,
            manifest=body.manifest,
            content_hash=content_hash,
            created_by=user_id,
            organization_id=body.organization_id,
        )
        session.add(pack)
        await session.flush()
    else:
        pack.name = body.name
        pack.description = body.description
        pack.version = body.version
        pack.source = body.source
        pack.manifest = body.manifest
        pack.content_hash = content_hash
        pack.organization_id = body.organization_id

    await session.execute(delete(TrainingTaskDefinition).where(TrainingTaskDefinition.pack_id == pack.id))
    definitions = [
        TrainingTaskDefinition(
            id=definition.id,
            pack_id=pack.id,
            title=definition.title,
            description=definition.description,
            agent=definition.agent,
            dimension=definition.dimension,
            steps=definition.steps,
            requires_review=definition.requires_review,
            peer_review=definition.peer_review,
        )
        for definition in body.definitions
    ]
    session.add_all(definitions)
    await session.commit()
    return ok(serialize_pack(pack, definitions))

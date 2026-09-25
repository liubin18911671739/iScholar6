"""Experiment CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok, owned_experiment
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Experiment

router = APIRouter(prefix="/experiments", tags=["data"])


class ExperimentCreate(CamelModel):
    project_id: uuid.UUID
    name: str = Field(min_length=1, max_length=400)
    dataset: str | None = None
    params: dict[str, Any] | None = None
    results: dict[str, Any] | None = None
    script_blob_url: str | None = Field(default=None, max_length=600)


class ExperimentUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=400)
    dataset: str | None = None
    params: dict[str, Any] | None = None
    results: dict[str, Any] | None = None
    script_blob_url: str | None = Field(default=None, max_length=600)


def serialize_experiment(experiment: Experiment) -> dict[str, Any]:
    return {
        "id": str(experiment.id),
        "projectId": str(experiment.project_id),
        "name": experiment.name,
        "dataset": experiment.dataset,
        "params": experiment.params,
        "results": experiment.results,
        "scriptBlobUrl": experiment.script_blob_url,
        "createdAt": iso(experiment.created_at),
    }


@router.get("")
async def list_experiments(
    project_id: uuid.UUID = Query(alias="projectId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, project_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(Experiment)
            .where(Experiment.project_id == project_id)
            .order_by(Experiment.created_at.desc())
        )
    ).all()
    return ok([serialize_experiment(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_experiment(
    body: ExperimentCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, body.project_id, identity_uuid(identity))
    experiment = Experiment(
        project_id=body.project_id,
        name=body.name,
        dataset=body.dataset,
        params=body.params or {},
        results=body.results or {},
        script_blob_url=body.script_blob_url,
    )
    session.add(experiment)
    await session.commit()
    return ok(serialize_experiment(experiment))


@router.patch("/{experiment_id}")
async def update_experiment(
    experiment_id: uuid.UUID,
    body: ExperimentUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    experiment = await owned_experiment(session, experiment_id, identity_uuid(identity))
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(experiment, key, value)
    await session.commit()
    return ok(serialize_experiment(experiment))


@router.delete("/{experiment_id}")
async def delete_experiment(
    experiment_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    experiment = await owned_experiment(session, experiment_id, identity_uuid(identity))
    await session.delete(experiment)
    await session.commit()
    return ok({"id": str(experiment_id)})

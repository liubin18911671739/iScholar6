"""RAG chunk create/list/delete for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, ok, owned_bib_item, owned_rag_chunk
from app.api.v1.deps import identity_uuid
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import RagChunk

router = APIRouter(prefix="/rag-chunks", tags=["data"])


class RagChunkCreate(CamelModel):
    bib_item_id: uuid.UUID
    chunk_index: int = 0
    content: str
    embedding: list[float] | None = None


class RagChunkBulkCreate(CamelModel):
    chunks: list[RagChunkCreate] = Field(min_length=1, max_length=1000)


def serialize_rag_chunk(chunk: RagChunk) -> dict[str, Any]:
    return {
        "id": str(chunk.id),
        "bibItemId": str(chunk.bib_item_id),
        "chunkIndex": chunk.chunk_index,
        "content": chunk.content,
    }


@router.get("")
async def list_rag_chunks(
    bib_item_id: uuid.UUID = Query(alias="bibItemId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_bib_item(session, bib_item_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(RagChunk)
            .where(RagChunk.bib_item_id == bib_item_id)
            .order_by(RagChunk.chunk_index)
        )
    ).all()
    return ok([serialize_rag_chunk(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_rag_chunk(
    body: RagChunkCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_bib_item(session, body.bib_item_id, identity_uuid(identity))
    chunk = RagChunk(
        bib_item_id=body.bib_item_id,
        chunk_index=body.chunk_index,
        content=body.content,
        embedding=body.embedding,
    )
    session.add(chunk)
    await session.commit()
    return ok(serialize_rag_chunk(chunk))


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_rag_chunks(
    body: RagChunkBulkCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    created: list[RagChunk] = []
    for entry in body.chunks:
        await owned_bib_item(session, entry.bib_item_id, owner_id)
        chunk = RagChunk(
            bib_item_id=entry.bib_item_id,
            chunk_index=entry.chunk_index,
            content=entry.content,
            embedding=entry.embedding,
        )
        session.add(chunk)
        created.append(chunk)
    await session.commit()
    return ok([serialize_rag_chunk(chunk) for chunk in created])


@router.delete("/{chunk_id}")
async def delete_rag_chunk(
    chunk_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    chunk = await owned_rag_chunk(session, chunk_id, identity_uuid(identity))
    await session.delete(chunk)
    await session.commit()
    return ok({"id": str(chunk_id)})

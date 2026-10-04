"""Vector search + embedding API.

`/search` embeds the query once and ranks owned ``bib_items`` and/or
``rag_chunks`` by pgvector cosine distance (HNSW-accelerated). All endpoints
require the signed service identity and return 503 when the optional
embeddings extra is not installed (the main backend image stays lean; run the
`vectors` profile or install ``.[vectors]``).
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, ok
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import BibItem, RagChunk
from app.vectors import embeddings

router = APIRouter(prefix="/vectors", tags=["vectors"])


class EmbedBody(CamelModel):
    texts: list[str] = Field(min_length=1, max_length=256)

    @field_validator("texts")
    @classmethod
    def _cap_text_length(cls, value: list[str]) -> list[str]:
        """Reject unbounded text so a single request cannot exhaust CPU/memory."""
        if any(len(text) > 8_000 for text in value):
            raise ValueError("EMBED_TEXT_TOO_LONG")
        return value


class SearchBody(CamelModel):
    project_id: uuid.UUID
    query: str = Field(min_length=1, max_length=2_000)
    top_k: int = Field(default=10, ge=1, le=50)
    target: Literal["bib_items", "rag_chunks", "both"] = "bib_items"


def score(distance: Any) -> float:
    """Convert a pgvector cosine distance into a cosine similarity (0..1, higher = closer)."""
    return 1.0 - float(distance)


@router.get("/status")
async def vectors_status(identity: Identity = Depends(require_identity)) -> dict[str, Any]:
    del identity
    return ok({"available": embeddings.is_available(), "model": embeddings.EMBEDDING_MODEL})


@router.post("/embed")
async def embed(body: EmbedBody, identity: Identity = Depends(require_identity)) -> dict[str, Any]:
    del identity
    try:
        vectors = embeddings.embed_texts(body.texts)
    except embeddings.EmbeddingUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="VECTORS_UNAVAILABLE") from exc
    return ok({"model": embeddings.EMBEDDING_MODEL, "vectors": vectors})


async def search_bib_items(
    session: AsyncSession, project_id: uuid.UUID, query_vector: list[float], top_k: int
) -> list[dict[str, Any]]:
    """Rank the project's embedded bibliography items by cosine distance."""
    rows = (
        await session.execute(
            select(
                BibItem.id,
                BibItem.title,
                BibItem.doi,
                BibItem.year,
                BibItem.embedding.cosine_distance(query_vector).label("distance"),
            )
            .where(BibItem.project_id == project_id, BibItem.embedding.is_not(None))
            .order_by(BibItem.embedding.cosine_distance(query_vector))
            .limit(top_k)
        )
    ).all()
    return [
        {
            "type": "bib_item",
            "id": str(row.id),
            "title": row.title,
            "doi": row.doi,
            "year": row.year,
            "score": score(row.distance),
        }
        for row in rows
    ]


async def search_rag_chunks(
    session: AsyncSession, project_id: uuid.UUID, query_vector: list[float], top_k: int
) -> list[dict[str, Any]]:
    """Rank the project's embedded RAG chunks, joined to their bibliography item."""
    rows = (
        await session.execute(
            select(
                RagChunk.id,
                RagChunk.chunk_index,
                RagChunk.content,
                BibItem.id.label("bib_item_id"),
                BibItem.title.label("bib_item_title"),
                BibItem.doi.label("bib_item_doi"),
                RagChunk.embedding.cosine_distance(query_vector).label("distance"),
            )
            .join(BibItem, BibItem.id == RagChunk.bib_item_id)
            .where(
                BibItem.project_id == project_id,
                RagChunk.embedding.is_not(None),
            )
            .order_by(RagChunk.embedding.cosine_distance(query_vector))
            .limit(top_k)
        )
    ).all()
    return [
        {
            "type": "rag_chunk",
            "id": str(row.id),
            "chunkIndex": row.chunk_index,
            "content": row.content,
            "score": score(row.distance),
            "bibItem": {"id": str(row.bib_item_id), "title": row.bib_item_title, "doi": row.bib_item_doi},
        }
        for row in rows
    ]


@router.post("/search")
async def search(
    body: SearchBody,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, body.project_id, identity_uuid(identity))
    try:
        query_vector = embeddings.embed_texts([body.query])[0]
    except embeddings.EmbeddingUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="VECTORS_UNAVAILABLE") from exc

    if body.target == "bib_items":
        results = await search_bib_items(session, body.project_id, query_vector, body.top_k)
    elif body.target == "rag_chunks":
        results = await search_rag_chunks(session, body.project_id, query_vector, body.top_k)
    else:
        # "both": score against either table, then merge into one top_k list.
        paired = [
            *await search_bib_items(session, body.project_id, query_vector, body.top_k),
            *await search_rag_chunks(session, body.project_id, query_vector, body.top_k),
        ]
        results = sorted(paired, key=lambda item: item["score"], reverse=True)[: body.top_k]
    return ok(results)

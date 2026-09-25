"""Vector search + embedding API.

`/search` embeds the query and ranks owned ``bib_items`` by pgvector cosine
distance. Both endpoints return 503 when the optional embeddings model is not
installed (the main backend image stays lean; run the `vectors` profile).
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, ok
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import BibItem
from app.vectors import embeddings

router = APIRouter(prefix="/vectors", tags=["vectors"])


class EmbedBody(CamelModel):
    texts: list[str] = Field(min_length=1, max_length=256)


class SearchBody(CamelModel):
    project_id: uuid.UUID
    query: str = Field(min_length=1, max_length=2_000)
    top_k: int = Field(default=10, ge=1, le=50)


@router.get("/status")
async def vectors_status() -> dict[str, Any]:
    return ok({"available": embeddings.is_available(), "model": embeddings.EMBEDDING_MODEL})


@router.post("/embed")
async def embed(body: EmbedBody) -> dict[str, Any]:
    try:
        vectors = embeddings.embed_texts(body.texts)
    except embeddings.EmbeddingUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="VECTORS_UNAVAILABLE") from exc
    return ok({"model": embeddings.EMBEDDING_MODEL, "vectors": vectors})


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

    rows = (
        await session.scalars(
            select(BibItem)
            .where(BibItem.project_id == body.project_id, BibItem.embedding.is_not(None))
            .order_by(BibItem.embedding.cosine_distance(query_vector))
            .limit(body.top_k)
        )
    ).all()
    return ok(
        [
            {"id": str(row.id), "title": row.title, "doi": row.doi, "year": row.year}
            for row in rows
        ]
    )

"""Embedding backfill worker (run under the ``vectors`` compose profile).

Polls ``bib_items`` and ``rag_chunks`` rows whose ``embedding`` is null, computes
embeddings, and writes them back. Kept out of the main backend image so torch is
only installed where needed.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import BibItem, RagChunk
from app.vectors.embeddings import embed_texts

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BATCH_SIZE = 16


def bib_text(item: BibItem) -> str:
    """Text used to embed a bibliography item."""
    return "\n".join(part for part in (item.title, item.abstract or "") if part)


async def backfill_once() -> int:
    async with SessionLocal() as session:
        items = (await session.scalars(select(BibItem).where(BibItem.embedding.is_(None)).limit(BATCH_SIZE))).all()
        chunks = (await session.scalars(select(RagChunk).where(RagChunk.embedding.is_(None)).limit(BATCH_SIZE))).all()
        work: list[tuple[BibItem | RagChunk, str]] = []
        work.extend((item, bib_text(item)) for item in items)
        work.extend((chunk, chunk.content) for chunk in chunks)
        if not work:
            return 0
        vectors = embed_texts([text for _, text in work])
        for (row, _), vector in zip(work, vectors, strict=True):
            row.embedding = vector
        await session.commit()
        return len(work)


async def main() -> None:
    logger.info("vectors worker started")
    while True:
        try:
            count = await backfill_once()
        except Exception:  # noqa: BLE001 - worker must not die on transient errors
            logger.exception("embedding backfill failed")
            count = 0
        await asyncio.sleep(0.5 if count else 3.0)


if __name__ == "__main__":
    asyncio.run(main())

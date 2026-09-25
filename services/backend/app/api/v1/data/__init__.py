"""Research-core data API (``/v1/data/*``).

Each router enforces ownership from the signed service identity; authorization
policy lives in ``app.core.authz`` and shared lookups in ``app.api.v1.deps``.
"""

from fastapi import APIRouter

from app.api.v1.data import (
    attachments,
    bib_items,
    blocks,
    experiments,
    manuscripts,
    projects,
    rag_chunks,
    rebuttal_items,
    review_rounds,
    submissions,
    tasks,
    versions,
)

router = APIRouter(prefix="/data")
router.include_router(projects.router)
router.include_router(manuscripts.router)
router.include_router(blocks.router)
router.include_router(versions.router)
router.include_router(bib_items.router)
router.include_router(rag_chunks.router)
router.include_router(attachments.router)
router.include_router(experiments.router)
router.include_router(submissions.router)
router.include_router(review_rounds.router)
router.include_router(rebuttal_items.router)
router.include_router(tasks.router)

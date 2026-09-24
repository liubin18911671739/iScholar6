"""Research-core data API (``/v1/data/*``).

Each router enforces ownership from the signed service identity; authorization
policy lives in ``app.core.authz`` and shared lookups in ``app.api.v1.deps``.
"""

from fastapi import APIRouter

from app.api.v1.data import bib_items, blocks, manuscripts, projects, tasks

router = APIRouter(prefix="/data")
router.include_router(projects.router)
router.include_router(manuscripts.router)
router.include_router(blocks.router)
router.include_router(bib_items.router)
router.include_router(tasks.router)

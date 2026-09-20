"""FastAPI application entrypoint for the iScholar backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.db import engine
from app.models import Project  # noqa: F401 - imports models before Alembic/autogeneration

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Dispose the database engine cleanly on shutdown."""
    yield
    await engine.dispose()


app = FastAPI(
    title="iScholar Backend",
    version="0.1.0",
    description="Domain data API + LangGraph agent runtime + MCP for iScholar.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/v1")

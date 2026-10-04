"""Shared fixtures for PostgreSQL-backed integration tests.

These tests need a reachable Postgres (compose `postgres`, or run through
`pnpm agent:test`). When no database is reachable they are skipped, so the
default offline `uv run pytest` stays green.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

import app.models  # noqa: F401 - register every ORM model on Base.metadata
from app.core.config import get_settings
from app.core.db import Base, get_session
from app.main import app

# Minimal subset of db/init/001_auth.sql so domain FKs to users(id) resolve.
_USERS_DDL = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext NOT NULL UNIQUE,
    name text,
    image text,
    email_verified timestamptz,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'learner',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
"""


@pytest_asyncio.fixture
async def db_engine():
    """Connect to Postgres or skip the test when it is unavailable."""
    engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - environment dependent
        await engine.dispose()
        pytest.skip(f"Postgres unavailable ({exc}); run `docker compose up -d --wait postgres`")
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncIterator[AsyncSession]:
    """Yield a session whose writes are rolled back at test teardown."""
    async with db_engine.begin() as connection:
        for statement in _USERS_DDL.split(";"):
            if statement.strip():
                await connection.execute(text(statement))
        await connection.run_sync(Base.metadata.create_all)

    connection = await db_engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()


@pytest_asyncio.fixture
async def client(db_session) -> AsyncIterator[AsyncClient]:
    """HTTP client bound to the app with `get_session` overridden to the test session."""

    async def _override() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
    app.dependency_overrides.clear()

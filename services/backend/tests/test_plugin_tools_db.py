"""Owner-scoped plugin tool resolution (PostgreSQL-backed; skipped offline)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import sign_identity
from app.mcp.plugin_tools import load_user_tools
from app.models import PluginInstall

_MANIFEST = {
    "schemaVersion": 1,
    "id": "demo",
    "mcpTools": [
        {
            "name": "demo.lookup",
            "description": "Look up a record",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
            "http": {"method": "GET", "url": "https://api.example.com/find?q={query}"},
        }
    ],
}


async def _seed_user(session: AsyncSession) -> uuid.UUID:
    user_id = uuid.uuid4()
    await session.execute(
        text("INSERT INTO users (id, email, password_hash, role) VALUES (:id, :email, 'x', 'learner')"),
        {"id": str(user_id), "email": f"{user_id}@test.local"},
    )
    return user_id


@pytest.mark.asyncio
async def test_load_user_tools_is_owner_scoped(client, db_session: AsyncSession) -> None:
    owner_a = await _seed_user(db_session)
    owner_b = await _seed_user(db_session)
    db_session.add(PluginInstall(id="demo", owner_id=owner_a, manifest=_MANIFEST, enabled=True))
    await db_session.commit()

    tools_a = await load_user_tools(db_session, owner_a)
    tools_b = await load_user_tools(db_session, owner_b)

    assert set(tools_a) == {"demo.lookup"}
    assert tools_b == {}

    listed = await client.get("/v1/mcp/tools", headers=sign_identity(str(owner_a)))
    assert listed.status_code == 200
    names = {tool["name"] for tool in listed.json()["data"]}
    assert "demo.lookup" in names
    assert "scholar.search" in names  # built-ins remain visible

    other = await client.get("/v1/mcp/tools", headers=sign_identity(str(owner_b)))
    other_names = {tool["name"] for tool in other.json()["data"]}
    assert "demo.lookup" not in other_names


@pytest.mark.asyncio
async def test_disabled_install_is_not_resolved(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    db_session.add(PluginInstall(id="demo", owner_id=owner, manifest=_MANIFEST, enabled=False))
    await db_session.commit()

    assert await load_user_tools(db_session, owner) == {}

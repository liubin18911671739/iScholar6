"""Vector/embedding contract tests + DB-backed search tests (Postgres optional)."""

from __future__ import annotations

import importlib.util
import math
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.vectors import EmbedBody, SearchBody
from app.core.security import sign_identity
from app.models import BibItem, Project, RagChunk
from app.vectors import embeddings
from app.vectors.embeddings import EMBEDDING_DIM
from app.vectors.worker import bib_text


def test_embed_body_requires_texts() -> None:
    with pytest.raises(ValueError):
        EmbedBody(texts=[])


def test_embed_body_caps_text_length() -> None:
    with pytest.raises(ValueError):
        EmbedBody(texts=["x" * 8_001])


def test_search_body_defaults_and_aliases() -> None:
    body = SearchBody.model_validate({"projectId": str(uuid.uuid4()), "query": "graphene", "topK": 5})
    assert body.top_k == 5
    assert body.target == "bib_items"
    assert SearchBody.model_validate({"projectId": str(uuid.uuid4()), "query": "x"}).top_k == 10


def test_search_body_rejects_unknown_target() -> None:
    with pytest.raises(ValueError):
        SearchBody.model_validate({"projectId": str(uuid.uuid4()), "query": "x", "target": "notes"})


def test_bib_text_joins_title_and_abstract() -> None:
    class _Row:
        title = "A title"
        abstract = "An abstract"

    assert bib_text(_Row()) == "A title\nAn abstract"  # type: ignore[arg-type]


@pytest.mark.skipif(
    importlib.util.find_spec("sentence_transformers") is not None,
    reason="sentence-transformers installed; unavailable path not reachable",
)
def test_embed_texts_reports_unavailable_without_extra() -> None:
    embeddings._model.cache_clear()
    with pytest.raises(embeddings.EmbeddingUnavailable):
        embeddings.embed_texts(["hello"])
    assert embeddings.is_available() is False


# ── DB-backed search tests ────────────────────────────────────────────────────


def _unit(a: float, b: float) -> list[float]:
    """Normalized 384-dim embedding with its mass on the first two axes."""
    norm = math.hypot(a, b)
    vector = [0.0] * EMBEDDING_DIM
    vector[0], vector[1] = a / norm, b / norm
    return vector


async def _seed_user(session: AsyncSession) -> uuid.UUID:
    user_id = uuid.uuid4()
    await session.execute(
        text("INSERT INTO users (id, email, password_hash) VALUES (:id, :email, 'x')"),
        {"id": str(user_id), "email": f"vectors-{user_id}@test.local"},
    )
    return user_id


async def _seed_project(session: AsyncSession, owner_id: uuid.UUID, name: str) -> uuid.UUID:
    project = Project(owner_id=owner_id, name=name)
    session.add(project)
    await session.flush()
    return project.id


@pytest.mark.asyncio
async def test_vectors_require_identity(client) -> None:
    assert (await client.get("/v1/vectors/status")).status_code == 401
    assert (await client.post("/v1/vectors/embed", json={"texts": ["hi"]})).status_code == 401
    assert (
        await client.post("/v1/vectors/search", json={"projectId": str(uuid.uuid4()), "query": "x"})
    ).status_code == 401


@pytest.mark.asyncio
async def test_vectors_status_envelope(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    response = await client.get("/v1/vectors/status", headers=sign_identity(str(owner)))
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["data"]["model"] == embeddings.EMBEDDING_MODEL


@pytest.mark.asyncio
async def test_search_ranks_bib_items_by_similarity(
    client, db_session: AsyncSession, monkeypatch
) -> None:
    owner = await _seed_user(db_session)
    project = await _seed_project(db_session, owner, "vectors-search")
    top = await _seed_project_bib_item(db_session, project, "identical", _unit(1.0, 0.0))
    near = await _seed_project_bib_item(db_session, project, "near", _unit(0.9, 0.1))
    await _seed_project_bib_item(db_session, project, "orthogonal", _unit(0.0, 1.0))
    await _seed_project_bib_item(db_session, project, "no-embedding", None)

    monkeypatch.setattr(embeddings, "embed_texts", lambda texts: [_unit(1.0, 0.0) for _ in texts])

    response = await client.post(
        "/v1/vectors/search",
        json={"projectId": str(project), "query": "identical", "topK": 10},
        headers=sign_identity(str(owner)),
    )
    assert response.status_code == 200
    results = response.json()["data"]
    assert [row["id"] for row in results][:2] == [str(top), str(near)]
    assert all(row["type"] == "bib_item" for row in results)
    assert all(row["title"] != "no-embedding" for row in results)
    assert results[0]["score"] == pytest.approx(1.0, abs=1e-6)
    assert results[1]["score"] < results[0]["score"]


async def _seed_project_bib_item(
    session: AsyncSession, project_id: uuid.UUID, title: str, vector: list[float] | None
) -> uuid.UUID:
    item = BibItem(project_id=project_id, title=title, embedding=vector)
    session.add(item)
    await session.flush()
    return item.id


@pytest.mark.asyncio
async def test_search_rag_chunks_joins_bib_item(
    client, db_session: AsyncSession, monkeypatch
) -> None:
    owner = await _seed_user(db_session)
    project = await _seed_project(db_session, owner, "vectors-chunks")
    item = await _seed_project_bib_item(db_session, project, "Some paper", None)
    best = await _add_rag_chunk(db_session, item, 0, "graphene lattice", _unit(1.0, 0.0))
    await _add_rag_chunk(db_session, item, 1, "unrelated", _unit(0.0, 1.0))

    monkeypatch.setattr(embeddings, "embed_texts", lambda texts: [_unit(1.0, 0.0) for _ in texts])

    response = await client.post(
        "/v1/vectors/search",
        json={"projectId": str(project), "query": "graphene", "target": "rag_chunks"},
        headers=sign_identity(str(owner)),
    )
    assert response.status_code == 200
    results = response.json()["data"]
    assert results[0]["id"] == str(best)
    assert results[0]["type"] == "rag_chunk"
    assert results[0]["content"] == "graphene lattice"
    assert results[0]["chunkIndex"] == 0
    assert results[0]["bibItem"]["id"] == str(item)
    assert results[0]["bibItem"]["title"] == "Some paper"
    assert results[0]["score"] == pytest.approx(1.0, abs=1e-6)


async def _add_rag_chunk(
    session: AsyncSession, bib_item_id: uuid.UUID, index: int, content: str, vector: list[float] | None
) -> uuid.UUID:
    chunk = RagChunk(bib_item_id=bib_item_id, chunk_index=index, content=content, embedding=vector)
    session.add(chunk)
    await session.flush()
    return chunk.id


@pytest.mark.asyncio
async def test_search_both_merges_and_sorts(client, db_session: AsyncSession, monkeypatch) -> None:
    owner = await _seed_user(db_session)
    project = await _seed_project(db_session, owner, "vectors-both")
    item_top = await _seed_project_bib_item(db_session, project, "bib winner", _unit(1.0, 0.0))
    item_mid = await _seed_project_bib_item(db_session, project, "bib runner-up", _unit(0.9, 0.1))
    chunk_mid = await _add_rag_chunk(db_session, item_mid, 0, "chunk winner", _unit(0.95, 0.05))

    monkeypatch.setattr(embeddings, "embed_texts", lambda texts: [_unit(1.0, 0.0) for _ in texts])

    response = await client.post(
        "/v1/vectors/search",
        json={"projectId": str(project), "query": "q", "target": "both", "topK": 3},
        headers=sign_identity(str(owner)),
    )
    assert response.status_code == 200
    results = response.json()["data"]
    assert [row["id"] for row in results] == [str(item_top), str(chunk_mid), str(item_mid)]
    scores = [row["score"] for row in results]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.asyncio
async def test_search_rejects_foreign_project(client, db_session: AsyncSession, monkeypatch) -> None:
    owner = await _seed_user(db_session)
    await _seed_project(db_session, owner, "mine")
    foreign_owner = uuid.uuid4()
    await db_session.execute(
        text("INSERT INTO users (id, email, password_hash) VALUES (:id, :email, 'x')"),
        {"id": str(foreign_owner), "email": f"vectors-foreign-{foreign_owner}@test.local"},
    )
    foreign_project = await _seed_project(db_session, foreign_owner, "not-yours")
    monkeypatch.setattr(embeddings, "embed_texts", lambda texts: [_unit(1.0, 0.0) for _ in texts])

    response = await client.post(
        "/v1/vectors/search",
        json={"projectId": str(foreign_project), "query": "q"},
        headers=sign_identity(str(owner)),
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "PROJECT_NOT_FOUND"


@pytest.mark.asyncio
async def test_search_returns_503_without_model(
    client, db_session: AsyncSession, monkeypatch
) -> None:
    owner = await _seed_user(db_session)
    project = await _seed_project(db_session, owner, "vectors-503")

    def _unavailable(texts: list[str]) -> list[list[float]]:
        raise embeddings.EmbeddingUnavailable("test-only")

    monkeypatch.setattr(embeddings, "embed_texts", _unavailable)
    response = await client.post(
        "/v1/vectors/search",
        json={"projectId": str(project), "query": "q"},
        headers=sign_identity(str(owner)),
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "VECTORS_UNAVAILABLE"

"""Vector/embedding contract tests (no torch required)."""

import importlib.util
import uuid

import pytest

from app.api.v1.vectors import EmbedBody, SearchBody
from app.vectors import embeddings
from app.vectors.worker import bib_text


def test_embed_body_requires_texts() -> None:
    with pytest.raises(ValueError):
        EmbedBody(texts=[])


def test_search_body_defaults_and_aliases() -> None:
    body = SearchBody.model_validate({"projectId": str(uuid.uuid4()), "query": "graphene", "topK": 5})
    assert body.top_k == 5
    assert SearchBody.model_validate({"projectId": str(uuid.uuid4()), "query": "x"}).top_k == 10


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

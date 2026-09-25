"""Server-side embeddings via sentence-transformers.

The model (``all-MiniLM-L6-v2``, 384-dim) is heavy (it pulls torch), so it is an
optional extra (``[vectors]``) and loaded lazily. When absent, callers get a
clear ``EmbeddingUnavailable`` and the API degrades to 503 instead of crashing.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


class EmbeddingUnavailable(RuntimeError):
    """Raised when the embeddings extra is not installed."""


@lru_cache
def _model() -> Any:
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise EmbeddingUnavailable(
            'sentence-transformers is not installed; run `uv pip install ".[vectors]"`'
        ) from exc
    return SentenceTransformer(EMBEDDING_MODEL)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed texts into normalized 384-dim vectors."""
    if not texts:
        return []
    vectors = _model().encode(texts, normalize_embeddings=True)
    return [[float(value) for value in vector] for vector in vectors]


def is_available() -> bool:
    """True when the embeddings model can be loaded."""
    try:
        _model()
        return True
    except EmbeddingUnavailable:
        return False

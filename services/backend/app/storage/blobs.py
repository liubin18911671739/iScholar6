"""Filesystem blob storage for attachments and scripts.

Blobs live under ``STORAGE_DIR`` (a compose volume) and are addressed by an
opaque generated name stored in ``attachments.storage_path``. User-supplied
filenames are never used as paths, which removes path-traversal risk.
"""

from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

from fastapi import HTTPException

from app.core.config import get_settings

MAX_BLOB_BYTES = 25 * 1024 * 1024


def _root() -> Path:
    root = Path(get_settings().storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_blob(content: bytes) -> tuple[str, str, int]:
    """Persist bytes and return ``(relative_path, sha256, size_bytes)``."""
    if not content:
        raise HTTPException(status_code=400, detail="EMPTY_BLOB")
    if len(content) > MAX_BLOB_BYTES:
        raise HTTPException(status_code=413, detail="BLOB_TOO_LARGE")
    digest = hashlib.sha256(content).hexdigest()
    name = uuid.uuid4().hex
    (_root() / name).write_bytes(content)
    return name, digest, len(content)


def resolve_blob(relative_path: str | None) -> Path:
    """Resolve a stored blob path, rejecting traversal and missing files."""
    if not relative_path:
        raise HTTPException(status_code=404, detail="BLOB_NOT_FOUND")
    root = _root().resolve()
    candidate = (root / relative_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise HTTPException(status_code=400, detail="INVALID_BLOB_PATH")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="BLOB_NOT_FOUND")
    return candidate


def delete_blob(relative_path: str | None) -> None:
    """Best-effort removal of a stored blob."""
    try:
        resolve_blob(relative_path).unlink(missing_ok=True)
    except HTTPException:
        pass

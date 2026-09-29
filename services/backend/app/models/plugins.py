"""Per-user plugin installs, prompt-pack selections, and declarative MCP tools."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.domain import now


class PluginInstall(Base):
    """A user's installed plugin (manifest stored as JSONB)."""

    __tablename__ = "plugin_installs"

    # Plugin id (e.g. "open-library-tools") — not globally unique per user.
    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False, default="1.0.0")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    manifest: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    content_hash: Mapped[str | None] = mapped_column(String(128))
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class PromptPackSelection(Base):
    """A user's active prompt-pack selection for one agent."""

    __tablename__ = "prompt_pack_selections"

    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    agent_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    pack_ref: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)

"""Shared helpers for the training / organization / LMS API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base request model accepting/emitting camelCase JSON keys."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def ok(data: Any) -> dict[str, Any]:
    """Standard success envelope."""
    return {"ok": True, "data": data}


def iso(value: datetime | None) -> str | None:
    """Serialize a datetime to ISO-8601, tolerating nulls."""
    return value.isoformat() if value else None


def iso_date(value: date | None) -> str | None:
    """Serialize a date to ISO-8601, tolerating nulls."""
    return value.isoformat() if value else None

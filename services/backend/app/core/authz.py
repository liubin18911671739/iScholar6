"""Application-layer authorization policy.

Supabase RLS was the previous enforcement point. With plain Postgres, all
authorization is centralized here and applied inside the data layer (Stage 1+).
"""

from enum import StrEnum


class Role(StrEnum):
    """Global role stored on ``users.role``."""

    LEARNER = "learner"
    LIBRARIAN = "librarian"
    ADMIN = "admin"


class OrgRole(StrEnum):
    """Role inside an organization membership."""

    ORG_ADMIN = "org_admin"
    LIBRARIAN = "librarian"
    VIEWER = "viewer"


def is_global_staff(role: str | None) -> bool:
    """True when the global role may manage camps and staff operations."""
    return role in {Role.LIBRARIAN, Role.ADMIN}

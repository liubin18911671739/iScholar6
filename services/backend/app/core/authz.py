"""Application-layer authorization policy.

Supabase RLS was the previous enforcement point. With plain Postgres, all
authorization is centralized here and applied by the API layer. Functions are
pure (role/ownership inputs) so they can be unit-tested without a database;
callers resolve the global role via ``app.api.v1.deps.resolve_role``.
"""

from enum import StrEnum
from uuid import UUID


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


class ProgramRole(StrEnum):
    """Per-program role from ``training_enrollments.role``."""

    LEARNER = "learner"
    TA = "ta"


def is_global_staff(role: str | None) -> bool:
    """True when the global role may manage camps and staff operations."""
    return role in {Role.LIBRARIAN, Role.ADMIN}


def is_global_admin(role: str | None) -> bool:
    """True when the global role is a platform admin."""
    return role == Role.ADMIN


def is_org_staff(role: str | None, org_role: str | None) -> bool:
    """True when the caller is a global admin or an org-level staff member."""
    if is_global_admin(role):
        return True
    return org_role in {OrgRole.ORG_ADMIN, OrgRole.LIBRARIAN}


def can_manage_project(role: str | None, owner_id: UUID, user_id: UUID) -> bool:
    """Project access: the owner or any global staff member."""
    return owner_id == user_id or is_global_staff(role)


def can_manage_program(
    role: str | None,
    *,
    owner_id: UUID | None,
    user_id: UUID,
    has_org: bool,
    org_role: str | None,
) -> bool:
    """Mirror of the legacy ``can_manage_program`` RLS predicate."""
    if is_global_admin(role):
        return True
    if owner_id is not None and owner_id == user_id:
        return True
    if has_org:
        return is_org_staff(role, org_role)
    return is_global_staff(role)


def can_review_submission(role: str | None, *, is_program_ta: bool) -> bool:
    """Staff or the submission program's TA may review."""
    return is_global_staff(role) or is_program_ta

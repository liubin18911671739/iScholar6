"""Authorization parity tests (pure policy, no database)."""

import uuid

from app.core.authz import (
    OrgRole,
    Role,
    can_manage_program,
    can_manage_project,
    can_review_submission,
    is_global_admin,
    is_global_staff,
    is_org_staff,
)

OWNER = uuid.uuid4()
OTHER = uuid.uuid4()
ORG = uuid.uuid4()


def test_global_staff_matrix() -> None:
    assert is_global_staff(Role.LIBRARIAN) is True
    assert is_global_staff(Role.ADMIN) is True
    assert is_global_staff(Role.LEARNER) is False
    assert is_global_staff(None) is False


def test_global_admin() -> None:
    assert is_global_admin(Role.ADMIN) is True
    assert is_global_admin(Role.LIBRARIAN) is False
    assert is_global_admin(None) is False


def test_org_staff() -> None:
    assert is_org_staff(Role.ADMIN, None) is True
    assert is_org_staff(Role.LEARNER, OrgRole.ORG_ADMIN) is True
    assert is_org_staff(Role.LEARNER, OrgRole.LIBRARIAN) is True
    assert is_org_staff(Role.LEARNER, OrgRole.VIEWER) is False
    assert is_org_staff(Role.LEARNER, None) is False


def test_can_manage_project() -> None:
    assert can_manage_project(Role.LEARNER, OWNER, OWNER) is True
    assert can_manage_project(Role.LEARNER, OWNER, OTHER) is False
    assert can_manage_project(Role.LIBRARIAN, OWNER, OTHER) is True
    assert can_manage_project(Role.ADMIN, OWNER, OTHER) is True


def test_can_manage_program_org_scoped() -> None:
    # Global admin always passes.
    assert can_manage_program(Role.ADMIN, owner_id=OTHER, user_id=OTHER, has_org=True, org_role=None) is True
    # Program owner passes.
    assert can_manage_program(Role.LEARNER, owner_id=OWNER, user_id=OWNER, has_org=True, org_role=None) is True
    # Org-scoped program: org staff passes, viewer does not (user is not the owner).
    assert can_manage_program(Role.LEARNER, owner_id=OWNER, user_id=OTHER, has_org=True, org_role=OrgRole.ORG_ADMIN) is True
    assert can_manage_program(Role.LEARNER, owner_id=OWNER, user_id=OTHER, has_org=True, org_role=OrgRole.VIEWER) is False
    # Org-less program: legacy global staff passes; a plain non-owner learner does not.
    assert can_manage_program(Role.LIBRARIAN, owner_id=OWNER, user_id=OTHER, has_org=False, org_role=None) is True
    assert can_manage_program(Role.LEARNER, owner_id=OWNER, user_id=OTHER, has_org=False, org_role=None) is False


def test_can_review_submission() -> None:
    assert can_review_submission(Role.LIBRARIAN, is_program_ta=False) is True
    assert can_review_submission(Role.ADMIN, is_program_ta=False) is True
    assert can_review_submission(Role.LEARNER, is_program_ta=True) is True
    assert can_review_submission(Role.LEARNER, is_program_ta=False) is False

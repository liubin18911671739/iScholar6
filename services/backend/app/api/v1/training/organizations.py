"""Organization (tenant) and membership management for the signed backend API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import global_role, org_role, user_contacts
from app.core.authz import is_global_admin, is_org_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Organization, OrganizationMember

router = APIRouter(prefix="/organizations", tags=["training"])


class OrganizationCreate(CamelModel):
    name: str = Field(min_length=1, max_length=240)
    slug: str = Field(min_length=1, max_length=120)


class MemberUpsert(CamelModel):
    user_id: uuid.UUID
    role: str | None = Field(default=None, max_length=32)


def serialize_org(org: Organization) -> dict[str, Any]:
    return {"id": str(org.id), "name": org.name, "slug": org.slug, "createdAt": iso(org.created_at)}


def serialize_member(member: OrganizationMember) -> dict[str, Any]:
    return {
        "orgId": str(member.org_id),
        "userId": str(member.user_id),
        "role": member.role,
        "createdAt": iso(member.created_at),
    }


async def _require_org_admin(session: AsyncSession, role: str | None, user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """Global admin or org_admin may administer memberships; org staff may read."""
    if is_global_admin(role):
        return
    membership_role = await org_role(session, user_id, org_id)
    if membership_role == "org_admin":
        return
    raise HTTPException(status_code=403, detail="FORBIDDEN")


@router.get("")
async def list_organizations(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)

    if is_global_admin(role):
        rows = (await session.scalars(select(Organization).order_by(Organization.name))).all()
    else:
        member_org_ids = select(OrganizationMember.org_id).where(OrganizationMember.user_id == user_id)
        rows = (
            await session.scalars(select(Organization).where(Organization.id.in_(member_org_ids)).order_by(Organization.name))
        ).all()
    return ok([serialize_org(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    body: OrganizationCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    if not is_global_admin(role):
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    org = Organization(name=body.name, slug=body.slug)
    session.add(org)
    await session.commit()
    return ok(serialize_org(org))


@router.get("/{org_id}/members")
async def list_members(
    org_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    membership_role = await org_role(session, user_id, org_id)
    if not is_org_staff(role, membership_role):
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    rows = (
        await session.scalars(
            select(OrganizationMember)
            .where(OrganizationMember.org_id == org_id)
            .order_by(OrganizationMember.created_at)
        )
    ).all()
    contacts = await user_contacts(session, [row.user_id for row in rows])
    data = []
    for row in rows:
        contact = contacts.get(str(row.user_id), {})
        data.append(
            {
                **serialize_member(row),
                "displayName": contact.get("name"),
                "email": contact.get("email"),
                "profileRole": contact.get("role"),
            }
        )
    can_manage = is_global_admin(role) or membership_role == "org_admin"
    return {"ok": True, "data": data, "canManage": can_manage}


@router.post("/{org_id}/members", status_code=status.HTTP_201_CREATED)
async def upsert_member(
    org_id: uuid.UUID,
    body: MemberUpsert,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    await _require_org_admin(session, role, user_id, org_id)

    org = await session.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="ORG_NOT_FOUND")

    member = await session.get(OrganizationMember, (org_id, body.user_id))
    if member is None:
        member = OrganizationMember(org_id=org_id, user_id=body.user_id, role=body.role or "librarian")
        session.add(member)
    elif body.role is not None:
        member.role = body.role
    await session.commit()
    return ok(serialize_member(member))


@router.delete("/{org_id}/members/{member_user_id}")
async def remove_member(
    org_id: uuid.UUID,
    member_user_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    # Symmetric with upsert_member: only global admin or org_admin may remove.
    await _require_org_admin(session, role, user_id, org_id)

    member = await session.get(OrganizationMember, (org_id, member_user_id))
    if member is None:
        raise HTTPException(status_code=404, detail="MEMBER_NOT_FOUND")
    await session.delete(member)
    await session.commit()
    return ok({"orgId": str(org_id), "userId": str(member_user_id)})

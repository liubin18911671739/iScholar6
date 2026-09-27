"""Training, organization, and LMS domain models.

Ports the legacy Supabase training/camp schema to the FastAPI-owned Postgres
schema. Identity columns (``owner_id`` / ``learner_id`` / ``reviewer_id`` /
``created_by`` / ``user_id``) point at the web-owned Auth.js ``users`` table:
they are intentionally not ORM ``ForeignKey``s here, and the DB constraints are
added by migration ``20260927_0004``.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.domain import now


class Organization(Base):
    """Tenant / department boundary for training camps."""

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class OrganizationMember(Base):
    """Membership of a user in an organization (composite PK)."""

    __tablename__ = "organization_members"

    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    # Not an ORM ForeignKey: the auth `users` table is web-owned and unmodeled.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="librarian")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class TrainingProgram(Base):
    """A training camp / cohort."""

    __tablename__ = "training_programs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(400), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discipline: Mapped[str | None] = mapped_column(String(240))
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    cohort_name: Mapped[str | None] = mapped_column(String(240))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    max_members: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class TrainingEnrollment(Base):
    """A learner's (or TA's) enrollment in a program."""

    __tablename__ = "training_enrollments"
    __table_args__ = (UniqueConstraint("program_id", "learner_id", name="uq_training_enrollments_program_learner"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    learner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="learner")
    last_nudged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class TrainingSubmission(Base):
    """A learner's answer submission for a camp task."""

    __tablename__ = "training_submissions"
    __table_args__ = (
        UniqueConstraint("program_id", "task_id", "learner_id", name="uq_training_submissions_program_task_learner"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[str] = mapped_column(String(200), nullable=False)
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    learner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    answers: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    reflection: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    peer_status: Mapped[str | None] = mapped_column(String(32))
    claimed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class TrainingReview(Base):
    """A staff or TA review of a submission."""

    __tablename__ = "training_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    reviewer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class TrainingTask(Base):
    """Legacy local-entity training task (text id), used by learner hooks."""

    __tablename__ = "training_tasks"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("training_programs.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    agent: Mapped[str | None] = mapped_column(String(64))
    dimension: Mapped[str] = mapped_column(String(64), nullable=False)
    steps: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started")
    requires_review: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class EvidenceCard(Base):
    """A learner's evidence card tied to a submission (text ids for parity)."""

    __tablename__ = "evidence_cards"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    submission_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    source_excerpt: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    bib_item_id: Mapped[str | None] = mapped_column(String(120))
    verification_status: Mapped[str] = mapped_column(String(32), nullable=False)
    evidence_strength: Mapped[str | None] = mapped_column(String(32))
    user_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class TrainingProgramTask(Base):
    """A task in a camp's curriculum (selection, order, due date)."""

    __tablename__ = "training_program_tasks"
    __table_args__ = (UniqueConstraint("program_id", "task_id", name="uq_training_program_tasks_program_task"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[str] = mapped_column(String(200), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    requires_review_override: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class TrainingTaskPack(Base):
    """A custom training task pack (JSON manifest)."""

    __tablename__ = "training_task_packs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pack_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(400), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(64), nullable=False, default="1.0.0")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="upload")
    manifest: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    content_hash: Mapped[str | None] = mapped_column(String(128))
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class TrainingTaskDefinition(Base):
    """A task definition belonging to a pack (text id)."""

    __tablename__ = "training_task_definitions"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    pack_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("training_task_packs.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    agent: Mapped[str] = mapped_column(String(64), nullable=False)
    dimension: Mapped[str] = mapped_column(String(64), nullable=False)
    steps: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    requires_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    peer_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class TrainingCertificate(Base):
    """A camp completion certificate with a SHA-256 content hash (text id)."""

    __tablename__ = "training_certificates"
    __table_args__ = (
        UniqueConstraint("program_id", "learner_id", name="uq_training_certificates_program_learner"),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    learner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    content_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class TrainingPeerAssignment(Base):
    """One anonymous peer-review assignment per submission."""

    __tablename__ = "training_peer_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_submissions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Not an ORM ForeignKey: web-owned users(id); constraint added by migration.
    reviewer_learner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TrainingPeerReview(Base):
    """The peer reviewer's verdict for an assignment."""

    __tablename__ = "training_peer_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_peer_assignments.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    score: Mapped[int | None] = mapped_column(Integer)
    feedback: Mapped[str | None] = mapped_column(Text)
    evidence_card_ids: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


class TrainingLmsLink(Base):
    """Per-program LMS/LTI AGS credentials (server-only secrets)."""

    __tablename__ = "training_lms_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="canvas")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    issuer: Mapped[str | None] = mapped_column(String(400))
    client_id: Mapped[str | None] = mapped_column(String(400))
    client_secret: Mapped[str | None] = mapped_column(Text)
    token_url: Mapped[str | None] = mapped_column(String(600))
    ags_lineitem_url: Mapped[str | None] = mapped_column(String(600))
    deployment_id: Mapped[str | None] = mapped_column(String(200))
    auth_method: Mapped[str] = mapped_column(String(32), nullable=False, default="client_secret_post")
    private_key_pem: Mapped[str | None] = mapped_column(Text)
    last_push_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_push_status: Mapped[str | None] = mapped_column(String(64))
    last_push_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)

"""Add training / organization / LMS tables.

Revision ID: 20260927_0004
Revises: 20260925_0003
Create Date: 2026-09-27
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260927_0004"
down_revision = "20260925_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    text_array = postgresql.ARRAY(sa.Text())
    now = sa.text("now()")

    # ── organizations ───────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    # Legacy parity: seed the default tenant so untagged camps resolve.
    op.execute(
        sa.text(
            "INSERT INTO organizations (id, name, slug) "
            "SELECT gen_random_uuid(), 'Default', 'default' "
            "WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'default')"
        )
    )

    op.create_table(
        "organization_members",
        sa.Column("org_id", uuid, sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", uuid, primary_key=True),
        sa.Column("role", sa.String(32), nullable=False, server_default="librarian"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_organization_members_user", "organization_members", ["user_id"])

    # ── training programs ───────────────────────────────────────────────────
    op.create_table(
        "training_programs",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(400), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("discipline", sa.String(240)),
        sa.Column("owner_id", uuid, nullable=False),
        sa.Column("cohort_name", sa.String(240)),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("max_members", sa.Integer()),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.CheckConstraint("status in ('draft', 'active', 'archived')", name="training_programs_status_check"),
        sa.CheckConstraint("max_members is null or max_members > 0", name="training_programs_max_members_check"),
        sa.CheckConstraint(
            "start_date is null or end_date is null or end_date >= start_date",
            name="training_programs_date_range_check",
        ),
    )
    op.create_index("ix_training_programs_owner", "training_programs", ["owner_id"])
    op.create_index("ix_training_programs_org", "training_programs", ["organization_id"])
    op.create_index("ix_training_programs_status_updated", "training_programs", ["status", sa.text("updated_at DESC")])

    # ── task packs + definitions ────────────────────────────────────────────
    op.create_table(
        "training_task_packs",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("pack_key", sa.String(200), nullable=False, unique=True),
        sa.Column("name", sa.String(400), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("version", sa.String(64), nullable=False, server_default="1.0.0"),
        sa.Column("source", sa.String(32), nullable=False, server_default="upload"),
        sa.Column("manifest", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("content_hash", sa.String(128)),
        sa.Column("created_by", uuid),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.CheckConstraint("source in ('builtin', 'upload', 'plugin')", name="training_task_packs_source_check"),
    )
    op.create_index("ix_training_task_packs_org", "training_task_packs", ["organization_id"])

    op.create_table(
        "training_task_definitions",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("pack_id", uuid, sa.ForeignKey("training_task_packs.id", ondelete="CASCADE")),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("agent", sa.String(64), nullable=False),
        sa.Column("dimension", sa.String(64), nullable=False),
        sa.Column("steps", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("requires_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("peer_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_training_task_definitions_pack", "training_task_definitions", ["pack_id"])

    # ── curriculum ──────────────────────────────────────────────────────────
    op.create_table(
        "training_program_tasks",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.String(200), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("requires_review_override", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.UniqueConstraint("program_id", "task_id", name="uq_training_program_tasks_program_task"),
    )
    op.create_index("ix_training_program_tasks_program_ordinal", "training_program_tasks", ["program_id", "ordinal"])

    # ── enrollments ─────────────────────────────────────────────────────────
    op.create_table(
        "training_enrollments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("learner_id", uuid, nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("role", sa.String(32), nullable=False, server_default="learner"),
        sa.Column("last_nudged_at", sa.DateTime(timezone=True)),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.CheckConstraint("status in ('active', 'completed', 'removed')", name="training_enrollments_status_check"),
        sa.CheckConstraint("role in ('learner', 'ta')", name="training_enrollments_role_check"),
        sa.UniqueConstraint("program_id", "learner_id", name="uq_training_enrollments_program_learner"),
    )
    op.create_index("ix_training_enrollments_program_status", "training_enrollments", ["program_id", "status"])
    op.create_index("ix_training_enrollments_learner", "training_enrollments", ["learner_id"])

    # ── submissions + reviews ───────────────────────────────────────────────
    op.create_table(
        "training_submissions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.String(200), nullable=False),
        sa.Column("learner_id", uuid, nullable=False),
        sa.Column("answers", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("reflection", sa.Text()),
        sa.Column("status", sa.String(32), nullable=False, server_default="submitted"),
        sa.Column("peer_status", sa.String(32)),
        sa.Column("claimed_by", uuid),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.CheckConstraint(
            "peer_status is null or peer_status in ('none', 'awaiting_peer', 'peer_done', 'peer_skipped')",
            name="training_submissions_peer_status_check",
        ),
        sa.UniqueConstraint("program_id", "task_id", "learner_id", name="uq_training_submissions_program_task_learner"),
    )
    op.create_index("ix_training_submissions_program", "training_submissions", ["program_id"])
    op.create_index("ix_training_submissions_learner", "training_submissions", ["learner_id"])
    op.create_index("ix_training_submissions_status_updated", "training_submissions", ["status", sa.text("updated_at DESC")])

    op.create_table(
        "training_reviews",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("submission_id", uuid, sa.ForeignKey("training_submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", uuid, nullable=False),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("feedback", sa.Text()),
        sa.Column("score", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.CheckConstraint("decision in ('approved', 'needs_revision', 'escalated')", name="training_reviews_decision_check"),
        sa.CheckConstraint("score is null or (score >= 0 and score <= 100)", name="training_reviews_score_check"),
    )
    op.create_index("ix_training_reviews_submission", "training_reviews", ["submission_id"])

    # ── local-entity parity tables ──────────────────────────────────────────
    op.create_table(
        "training_tasks",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="CASCADE")),
        sa.Column("project_id", sa.String(120), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("agent", sa.String(64)),
        sa.Column("dimension", sa.String(64), nullable=False),
        sa.Column("steps", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.String(32), nullable=False, server_default="not_started"),
        sa.Column("requires_review", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_training_tasks_program", "training_tasks", ["program_id"])

    op.create_table(
        "evidence_cards",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("submission_id", sa.String(120), nullable=False),
        sa.Column("project_id", sa.String(120), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("source_excerpt", sa.Text()),
        sa.Column("source_url", sa.Text()),
        sa.Column("bib_item_id", sa.String(120)),
        sa.Column("verification_status", sa.String(32), nullable=False),
        sa.Column("evidence_strength", sa.String(32)),
        sa.Column("user_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_evidence_cards_submission", "evidence_cards", ["submission_id"])
    op.create_index("ix_evidence_cards_project", "evidence_cards", ["project_id"])

    # ── certificates ────────────────────────────────────────────────────────
    op.create_table(
        "training_certificates",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("learner_id", uuid, nullable=False),
        sa.Column("content_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("payload", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.UniqueConstraint("program_id", "learner_id", name="uq_training_certificates_program_learner"),
    )
    op.create_index("ix_training_certificates_program_issued", "training_certificates", ["program_id", sa.text("issued_at DESC")])

    # ── peer review ─────────────────────────────────────────────────────────
    op.create_table(
        "training_peer_assignments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "submission_id", uuid, sa.ForeignKey("training_submissions.id", ondelete="CASCADE"), nullable=False, unique=True
        ),
        sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_learner_id", uuid, nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status in ('pending', 'completed', 'skipped', 'expired')", name="training_peer_assignments_status_check"
        ),
    )
    op.create_index("ix_training_peer_assignments_reviewer", "training_peer_assignments", ["reviewer_learner_id", "status"])
    op.create_index("ix_training_peer_assignments_program", "training_peer_assignments", ["program_id", "status"])

    op.create_table(
        "training_peer_reviews",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "assignment_id", uuid, sa.ForeignKey("training_peer_assignments.id", ondelete="CASCADE"), nullable=False, unique=True
        ),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("score", sa.Integer()),
        sa.Column("feedback", sa.Text()),
        sa.Column("evidence_card_ids", text_array, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.CheckConstraint("decision in ('approved', 'needs_revision')", name="training_peer_reviews_decision_check"),
        sa.CheckConstraint("score is null or (score >= 0 and score <= 100)", name="training_peer_reviews_score_check"),
    )

    # ── LMS links ───────────────────────────────────────────────────────────
    op.create_table(
        "training_lms_links",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("platform", sa.String(32), nullable=False, server_default="canvas"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("issuer", sa.String(400)),
        sa.Column("client_id", sa.String(400)),
        sa.Column("client_secret", sa.Text()),
        sa.Column("token_url", sa.String(600)),
        sa.Column("ags_lineitem_url", sa.String(600)),
        sa.Column("deployment_id", sa.String(200)),
        sa.Column("auth_method", sa.String(32), nullable=False, server_default="client_secret_post"),
        sa.Column("private_key_pem", sa.Text()),
        sa.Column("last_push_at", sa.DateTime(timezone=True)),
        sa.Column("last_push_status", sa.String(64)),
        sa.Column("last_push_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.CheckConstraint("platform in ('canvas', 'moodle', 'generic')", name="training_lms_links_platform_check"),
        sa.CheckConstraint(
            "auth_method in ('client_secret_post', 'client_secret_basic', 'private_key_jwt')",
            name="training_lms_links_auth_method_check",
        ),
    )
    op.create_index("ix_training_lms_links_program", "training_lms_links", ["program_id"])

    # ── identity FKs to web-owned users(id) ─────────────────────────────────
    op.create_foreign_key(
        "fk_organization_members_user_id_users",
        "organization_members",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_training_programs_owner_id_users", "training_programs", "users", ["owner_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_training_task_packs_created_by_users",
        "training_task_packs",
        "users",
        ["created_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_training_enrollments_learner_id_users",
        "training_enrollments",
        "users",
        ["learner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_training_submissions_learner_id_users",
        "training_submissions",
        "users",
        ["learner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_training_submissions_claimed_by_users",
        "training_submissions",
        "users",
        ["claimed_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_training_reviews_reviewer_id_users", "training_reviews", "users", ["reviewer_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_training_certificates_learner_id_users",
        "training_certificates",
        "users",
        ["learner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_training_peer_assignments_reviewer_learner_id_users",
        "training_peer_assignments",
        "users",
        ["reviewer_learner_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    for constraint, table in (
        ("fk_training_peer_assignments_reviewer_learner_id_users", "training_peer_assignments"),
        ("fk_training_certificates_learner_id_users", "training_certificates"),
        ("fk_training_reviews_reviewer_id_users", "training_reviews"),
        ("fk_training_submissions_claimed_by_users", "training_submissions"),
        ("fk_training_submissions_learner_id_users", "training_submissions"),
        ("fk_training_enrollments_learner_id_users", "training_enrollments"),
        ("fk_training_task_packs_created_by_users", "training_task_packs"),
        ("fk_training_programs_owner_id_users", "training_programs"),
        ("fk_organization_members_user_id_users", "organization_members"),
    ):
        op.drop_constraint(constraint, table, type_="foreignkey")

    op.drop_table("training_lms_links")
    op.drop_table("training_peer_reviews")
    op.drop_table("training_peer_assignments")
    op.drop_table("training_certificates")
    op.drop_table("evidence_cards")
    op.drop_table("training_tasks")
    op.drop_table("training_reviews")
    op.drop_table("training_submissions")
    op.drop_table("training_enrollments")
    op.drop_table("training_program_tasks")
    op.drop_table("training_task_definitions")
    op.drop_table("training_task_packs")
    op.drop_table("training_programs")
    op.drop_table("organization_members")
    op.drop_table("organizations")

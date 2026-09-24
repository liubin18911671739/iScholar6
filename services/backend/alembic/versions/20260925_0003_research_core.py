"""Add research-core tables and point owner columns at Auth.js users(id).

Revision ID: 20260925_0003
Revises: 20260920_0002
Create Date: 2026-09-25
"""

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260925_0003"
down_revision = "20260920_0002"
branch_labels = None
depends_on = None

EMBEDDING_DIM = 384


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    now = sa.text("now()")

    # ── projects: client-parity columns + identity FK ───────────────────────
    op.add_column("projects", sa.Column("status", sa.String(32), nullable=False, server_default="draft"))
    op.add_column("projects", sa.Column("discipline", sa.String(240)))
    op.add_column("projects", sa.Column("goal", sa.Text()))
    op.add_column("projects", sa.Column("encryption_key_ref", sa.String(240)))
    op.add_column("projects", sa.Column("metadata", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.create_foreign_key("fk_projects_owner_id_users", "projects", "users", ["owner_id"], ["id"], ondelete="CASCADE")

    # ── existing agent tables: identity FK ──────────────────────────────────
    op.create_foreign_key("fk_ai_consents_v2_owner_id_users", "ai_consents_v2", "users", ["owner_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("fk_agent_threads_owner_id_users", "agent_threads", "users", ["owner_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("fk_agent_runs_v2_owner_id_users", "agent_runs_v2", "users", ["owner_id"], ["id"], ondelete="CASCADE")

    # ── manuscripts ─────────────────────────────────────────────────────────
    op.create_table(
        "manuscripts",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("abstract", sa.Text()),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("target_journal", sa.String(300)),
        sa.Column("status", sa.String(32)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_manuscripts_project", "manuscripts", ["project_id"])

    op.create_table(
        "manuscript_blocks",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("manuscript_id", uuid, sa.ForeignKey("manuscripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section", sa.String(120), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("version", sa.Integer()),
        sa.Column("author_type", sa.String(32)),
        sa.Column("agent_run_id", uuid),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_manuscript_blocks_manuscript", "manuscript_blocks", ["manuscript_id"])

    op.create_table(
        "manuscript_versions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("manuscript_id", uuid, sa.ForeignKey("manuscripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("block_id", uuid),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("author_type", sa.String(32)),
        sa.Column("agent_run_id", uuid),
        sa.Column("content_hash", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_manuscript_versions_manuscript", "manuscript_versions", ["manuscript_id"])

    # ── bibliography + retrieval ────────────────────────────────────────────
    op.create_table(
        "bib_items",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doi", sa.String(300)),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("authors", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("year", sa.Integer()),
        sa.Column("venue", sa.String(400)),
        sa.Column("abstract", sa.Text()),
        sa.Column("keywords", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("citation_count", sa.Integer()),
        sa.Column("metadata", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("embedding", Vector(EMBEDDING_DIM)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_bib_items_project", "bib_items", ["project_id"])
    op.create_index("ix_bib_items_doi", "bib_items", ["doi"])
    op.create_index("ix_bib_items_year", "bib_items", ["year"])

    op.create_table(
        "attachments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bib_item_id", uuid, sa.ForeignKey("bib_items.id", ondelete="SET NULL")),
        sa.Column("filename", sa.String(400), nullable=False),
        sa.Column("storage_path", sa.String(600)),
        sa.Column("content_hash", sa.String(128)),
        sa.Column("mime_type", sa.String(200)),
        sa.Column("size_bytes", sa.Integer()),
        sa.Column("encrypted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_attachments_project", "attachments", ["project_id"])
    op.create_index("ix_attachments_bib_item", "attachments", ["bib_item_id"])

    op.create_table(
        "rag_chunks",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("bib_item_id", uuid, sa.ForeignKey("bib_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM)),
    )
    op.create_index("ix_rag_chunks_bib_item", "rag_chunks", ["bib_item_id"])

    # ── experiments ─────────────────────────────────────────────────────────
    op.create_table(
        "experiments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(400), nullable=False),
        sa.Column("dataset", sa.Text()),
        sa.Column("params", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("results", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("script_blob_url", sa.String(600)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_experiments_project", "experiments", ["project_id"])

    # ── submissions / reviews / rebuttals ───────────────────────────────────
    op.create_table(
        "submissions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("manuscript_id", uuid, sa.ForeignKey("manuscripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("journal_name", sa.String(400), nullable=False),
        sa.Column("cover_letter", sa.Text()),
        sa.Column("file_tree", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(32)),
    )
    op.create_index("ix_submissions_project", "submissions", ["project_id"])
    op.create_index("ix_submissions_manuscript", "submissions", ["manuscript_id"])
    op.create_index("ix_submissions_status", "submissions", ["status"])

    op.create_table(
        "review_rounds",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("submission_id", uuid, sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("decision", sa.String(64)),
        sa.Column("review_text", sa.Text()),
        sa.Column("deadline", sa.String(64)),
    )
    op.create_index("ix_review_rounds_submission", "review_rounds", ["submission_id"])

    op.create_table(
        "rebuttal_items",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("review_round_id", uuid, sa.ForeignKey("review_rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_comment", sa.Text(), nullable=False),
        sa.Column("response", sa.Text()),
        sa.Column("change_location", sa.Text()),
        sa.Column("evidence", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_rebuttal_items_review_round", "rebuttal_items", ["review_round_id"])

    # ── tasks ───────────────────────────────────────────────────────────────
    op.create_table(
        "tasks",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(400), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(32)),
        sa.Column("assignee", sa.String(240)),
        sa.Column("due_date", sa.String(64)),
        sa.Column("created_by", sa.String(240)),
    )
    op.create_index("ix_tasks_project", "tasks", ["project_id"])
    op.create_index("ix_tasks_status", "tasks", ["status"])


def downgrade() -> None:
    op.drop_table("tasks")
    op.drop_table("rebuttal_items")
    op.drop_table("review_rounds")
    op.drop_table("submissions")
    op.drop_table("experiments")
    op.drop_table("rag_chunks")
    op.drop_table("attachments")
    op.drop_table("bib_items")
    op.drop_table("manuscript_versions")
    op.drop_table("manuscript_blocks")
    op.drop_table("manuscripts")
    op.drop_constraint("fk_agent_runs_v2_owner_id_users", "agent_runs_v2", type_="foreignkey")
    op.drop_constraint("fk_agent_threads_owner_id_users", "agent_threads", type_="foreignkey")
    op.drop_constraint("fk_ai_consents_v2_owner_id_users", "ai_consents_v2", type_="foreignkey")
    op.drop_constraint("fk_projects_owner_id_users", "projects", type_="foreignkey")
    op.drop_column("projects", "metadata")
    op.drop_column("projects", "encryption_key_ref")
    op.drop_column("projects", "goal")
    op.drop_column("projects", "discipline")
    op.drop_column("projects", "status")

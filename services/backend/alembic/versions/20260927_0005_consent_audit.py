"""Add camp consent audit columns and the hash-chained audit ledger.

Revision ID: 20260927_0005
Revises: 20260927_0004
Create Date: 2026-09-27
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260927_0005"
down_revision = "20260927_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    now = sa.text("now()")

    # ── ai_consents_v2: camp-scoped audit fields ────────────────────────────
    op.add_column("ai_consents_v2", sa.Column("program_id", uuid, sa.ForeignKey("training_programs.id", ondelete="SET NULL")))
    op.add_column("ai_consents_v2", sa.Column("training_task_id", sa.String(200)))
    op.add_column(
        "ai_consents_v2",
        sa.Column("purpose", sa.String(32), nullable=False, server_default="agent_run"),
    )
    op.add_column(
        "ai_consents_v2",
        sa.Column("data_categories", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "ai_consents_v2",
        sa.Column("sensitive_scan", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_check_constraint(
        "ai_consents_v2_purpose_check",
        "ai_consents_v2",
        "purpose in ('agent_run', 'training_submit', 'mcp_tool', 'export')",
    )
    op.create_index("ix_ai_consents_v2_program", "ai_consents_v2", ["program_id", sa.text("created_at DESC")])

    # ── audit ledger (SHA-256 hash chain) ───────────────────────────────────
    op.create_table(
        "audit_ledger",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", uuid, nullable=False),
        sa.Column("agent_run_id", uuid),
        sa.Column("actor", sa.String(120)),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("prompt_hash", sa.String(128)),
        sa.Column("input_hash", sa.String(128)),
        sa.Column("output_hash", sa.String(128)),
        sa.Column("consent_id", sa.String(200)),
        sa.Column("parent_hash", sa.String(128)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_audit_ledger_project_created", "audit_ledger", ["project_id", "created_at"])
    op.create_foreign_key("fk_audit_ledger_owner_id_users", "audit_ledger", "users", ["owner_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint("fk_audit_ledger_owner_id_users", "audit_ledger", type_="foreignkey")
    op.drop_table("audit_ledger")
    op.drop_index("ix_ai_consents_v2_program", table_name="ai_consents_v2")
    op.drop_constraint("ai_consents_v2_purpose_check", "ai_consents_v2", type_="check")
    op.drop_column("ai_consents_v2", "sensitive_scan")
    op.drop_column("ai_consents_v2", "data_categories")
    op.drop_column("ai_consents_v2", "purpose")
    op.drop_column("ai_consents_v2", "training_task_id")
    op.drop_column("ai_consents_v2", "program_id")

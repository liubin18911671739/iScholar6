"""Add backend-owned consent records and queued resume payloads."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260920_0002"
down_revision = "20260920_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table("ai_consents_v2", sa.Column("id", uuid, primary_key=True), sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False), sa.Column("owner_id", uuid, nullable=False), sa.Column("external_services", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")), sa.Column("redaction_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_index("ix_ai_consents_v2_project", "ai_consents_v2", ["project_id"])
    op.add_column("agent_runs_v2", sa.Column("resume_input", postgresql.JSONB(astext_type=sa.Text())))


def downgrade() -> None:
    op.drop_column("agent_runs_v2", "resume_input")
    op.drop_table("ai_consents_v2")

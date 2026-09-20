"""Create iScholar domain and agent-runtime product tables.

Revision ID: 20260920_0001
Revises:
Create Date: 2026-09-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260920_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table("projects", sa.Column("id", uuid, primary_key=True), sa.Column("owner_id", uuid, nullable=False, index=True), sa.Column("name", sa.String(240), nullable=False), sa.Column("description", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_table("agent_threads", sa.Column("id", uuid, primary_key=True), sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False), sa.Column("owner_id", uuid, nullable=False), sa.Column("title", sa.String(240)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_index("ix_agent_threads_project", "agent_threads", ["project_id"])
    op.create_index("ix_agent_threads_owner", "agent_threads", ["owner_id"])
    op.create_table("agent_runs_v2", sa.Column("id", uuid, primary_key=True), sa.Column("thread_id", uuid, sa.ForeignKey("agent_threads.id", ondelete="CASCADE"), nullable=False), sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False), sa.Column("owner_id", uuid, nullable=False), sa.Column("agent", sa.String(64), nullable=False), sa.Column("goal", sa.Text(), nullable=False), sa.Column("input", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("status", sa.String(32), nullable=False, server_default="queued"), sa.Column("consent_id", uuid), sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("idempotency_key", sa.String(128), unique=True), sa.Column("error", sa.Text()), sa.Column("result", postgresql.JSONB(astext_type=sa.Text())), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_index("ix_agent_runs_v2_worker", "agent_runs_v2", ["status", "created_at"])
    op.create_table("agent_run_events", sa.Column("id", uuid, primary_key=True), sa.Column("run_id", uuid, sa.ForeignKey("agent_runs_v2.id", ondelete="CASCADE"), nullable=False), sa.Column("sequence", sa.Integer(), nullable=False), sa.Column("type", sa.String(64), nullable=False), sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("run_id", "sequence", name="uq_agent_event_sequence"))
    op.create_index("ix_agent_run_events_run", "agent_run_events", ["run_id", "sequence"])
    op.create_table("artifacts", sa.Column("id", uuid, primary_key=True), sa.Column("run_id", uuid, sa.ForeignKey("agent_runs_v2.id", ondelete="CASCADE"), nullable=False), sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False), sa.Column("kind", sa.String(64), nullable=False), sa.Column("status", sa.String(32), nullable=False, server_default="draft"), sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False), sa.Column("idempotency_key", sa.String(128), nullable=False), sa.Column("reviewed_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("run_id", "idempotency_key", name="uq_artifact_run_key"))
    op.create_table("evidence", sa.Column("id", uuid, primary_key=True), sa.Column("run_id", uuid, sa.ForeignKey("agent_runs_v2.id", ondelete="CASCADE"), nullable=False), sa.Column("title", sa.Text(), nullable=False), sa.Column("source_url", sa.Text(), nullable=False), sa.Column("doi", sa.String(256)), sa.Column("excerpt", sa.Text()), sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))


def downgrade() -> None:
    op.drop_table("evidence")
    op.drop_table("artifacts")
    op.drop_table("agent_run_events")
    op.drop_table("agent_runs_v2")
    op.drop_table("agent_threads")
    op.drop_table("projects")

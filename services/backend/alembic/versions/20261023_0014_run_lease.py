"""Add worker lease columns to agent runs (fencing + reaper).

Revision ID: 20261023_0014
Revises: 20260929_0013
Create Date: 2026-10-23
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261023_0014"
down_revision = "20260929_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.add_column("agent_runs_v2", sa.Column("lease_token", uuid))
    op.add_column("agent_runs_v2", sa.Column("lease_expires_at", sa.DateTime(timezone=True)))
    op.add_column("agent_runs_v2", sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"))
    # Reaper scan: only running rows are leased; a partial index keeps it tiny.
    op.execute(
        sa.text(
            "CREATE INDEX ix_agent_runs_v2_lease ON agent_runs_v2 (lease_expires_at) "
            "WHERE status = 'running'"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_agent_runs_v2_lease", table_name="agent_runs_v2")
    op.drop_column("agent_runs_v2", "attempt")
    op.drop_column("agent_runs_v2", "lease_expires_at")
    op.drop_column("agent_runs_v2", "lease_token")

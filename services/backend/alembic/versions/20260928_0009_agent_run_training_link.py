"""Link agent runs to training tasks/programs and mode.

Revision ID: 20260928_0009
Revises: 20260928_0008
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260928_0009"
down_revision = "20260928_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.add_column("agent_runs_v2", sa.Column("training_task_id", sa.String(200)))
    op.add_column("agent_runs_v2", sa.Column("program_id", uuid))
    op.add_column("agent_runs_v2", sa.Column("mode", sa.String(16)))
    op.add_column("agent_runs_v2", sa.Column("submission_id", uuid))
    op.create_foreign_key(
        "fk_agent_runs_v2_program_id_training_programs",
        "agent_runs_v2",
        "training_programs",
        ["program_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_agent_runs_v2_program", "agent_runs_v2", ["program_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_runs_v2_program", table_name="agent_runs_v2")
    op.drop_constraint("fk_agent_runs_v2_program_id_training_programs", "agent_runs_v2", type_="foreignkey")
    op.drop_column("agent_runs_v2", "submission_id")
    op.drop_column("agent_runs_v2", "mode")
    op.drop_column("agent_runs_v2", "program_id")
    op.drop_column("agent_runs_v2", "training_task_id")

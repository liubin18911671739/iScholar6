"""Scope agent-run idempotency keys to their owner.

The old column-level unique constraint was global, so two users sending the
same client-chosen ``Idempotency-Key`` collided with a 500. Replace it with a
composite ``(owner_id, idempotency_key)`` unique constraint.

Revision ID: 20260929_0011
Revises: 20260929_0010
Create Date: 2026-09-29
"""

from alembic import op

revision = "20260929_0011"
down_revision = "20260929_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("agent_runs_v2_idempotency_key_key", "agent_runs_v2", type_="unique")
    op.create_unique_constraint(
        "uq_agent_runs_v2_owner_idempotency",
        "agent_runs_v2",
        ["owner_id", "idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_agent_runs_v2_owner_idempotency", "agent_runs_v2", type_="unique")
    op.create_unique_constraint("agent_runs_v2_idempotency_key_key", "agent_runs_v2", ["idempotency_key"])

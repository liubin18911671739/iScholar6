"""Add a persisted chain hash to the audit ledger.

Revision ID: 20260928_0007
Revises: 20260927_0006
Create Date: 2026-09-28
"""

import sqlalchemy as sa

from alembic import op

revision = "20260928_0007"
down_revision = "20260927_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_ledger", sa.Column("chain_hash", sa.String(128)))


def downgrade() -> None:
    op.drop_column("audit_ledger", "chain_hash")

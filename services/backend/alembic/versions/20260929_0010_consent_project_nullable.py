"""Allow program-scoped (project-less) consent rows.

Camp submissions record consent against a training program rather than a
research project, so ``ai_consents_v2.project_id`` becomes nullable. Existing
rows keep their project; ``training_submit`` consents may omit it.

Revision ID: 20260929_0010
Revises: 20260928_0009
Create Date: 2026-09-29
"""

from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260929_0010"
down_revision = "20260928_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "ai_consents_v2",
        "project_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "ai_consents_v2",
        "project_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

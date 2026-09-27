"""Add per-user plugin installs and prompt-pack selections.

Revision ID: 20260927_0006
Revises: 20260927_0005
Create Date: 2026-09-27
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260927_0006"
down_revision = "20260927_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    now = sa.text("now()")

    op.create_table(
        "plugin_installs",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("owner_id", uuid, primary_key=True),
        sa.Column("version", sa.String(64), nullable=False, server_default="1.0.0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("manifest", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("content_hash", sa.String(128)),
        sa.Column("installed_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_plugin_installs_owner", "plugin_installs", ["owner_id"])

    op.create_table(
        "prompt_pack_selections",
        sa.Column("owner_id", uuid, primary_key=True),
        sa.Column("agent_id", sa.String(200), primary_key=True),
        sa.Column("pack_ref", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )

    op.create_foreign_key(
        "fk_plugin_installs_owner_id_users", "plugin_installs", "users", ["owner_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_prompt_pack_selections_owner_id_users",
        "prompt_pack_selections",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_prompt_pack_selections_owner_id_users", "prompt_pack_selections", type_="foreignkey")
    op.drop_constraint("fk_plugin_installs_owner_id_users", "plugin_installs", type_="foreignkey")
    op.drop_table("prompt_pack_selections")
    op.drop_table("plugin_installs")

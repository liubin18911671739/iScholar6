"""Project declarative MCP tools from plugin manifests per user.

Revision ID: 20260928_0008
Revises: 20260928_0007
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260928_0008"
down_revision = "20260928_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    now = sa.text("now()")
    op.create_table(
        "plugin_mcp_tools",
        sa.Column("owner_id", uuid, nullable=False),
        sa.Column("plugin_id", sa.String(200), primary_key=True),
        sa.Column("name", sa.String(64), primary_key=True),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("parameters", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("http", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("result_path", sa.String(120)),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.PrimaryKeyConstraint("owner_id", "plugin_id", "name", name="pk_plugin_mcp_tools"),
    )
    op.create_index("ix_plugin_mcp_tools_owner", "plugin_mcp_tools", ["owner_id"])
    op.create_foreign_key(
        "fk_plugin_mcp_tools_owner_id_users",
        "plugin_mcp_tools",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_plugin_mcp_tools_owner_id_users", "plugin_mcp_tools", type_="foreignkey")
    op.drop_index("ix_plugin_mcp_tools_owner", table_name="plugin_mcp_tools")
    op.drop_table("plugin_mcp_tools")

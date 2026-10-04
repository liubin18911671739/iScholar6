"""Add HNSW cosine indexes for pgvector similarity search.

Revision ID: 20260929_0013
Revises: 20260929_0012
Create Date: 2026-10-04
"""

import sqlalchemy as sa

from alembic import op

revision = "20260929_0013"
down_revision = "20260929_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # HNSW over cosine distance (operators match /v1/vectors/search ordering).
    # op.execute is required: pgvector index types are not plain btree and
    # sqlalchemy's create_index cannot express the opclass. The dimension is
    # implicit in the vector(384) column type; no opclass argument is needed.
    op.execute(sa.text("CREATE INDEX ix_bib_items_embedding_hnsw ON bib_items USING hnsw (embedding vector_cosine_ops)"))
    op.execute(sa.text("CREATE INDEX ix_rag_chunks_embedding_hnsw ON rag_chunks USING hnsw (embedding vector_cosine_ops)"))


def downgrade() -> None:
    op.drop_index("ix_rag_chunks_embedding_hnsw", table_name="rag_chunks")
    op.drop_index("ix_bib_items_embedding_hnsw", table_name="bib_items")

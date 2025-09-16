"""init migration

Revision ID: cf5a3babac35
Revises: 083785171451
Create Date: 2025-09-16 17:05:49.142162
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cf5a3babac35'
down_revision: Union[str, None] = '083785171451'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # First, remove any rows that have NULL in file_url
    op.execute("DELETE FROM audio_files WHERE file_url IS NULL;")

    # Now safely alter the column to NOT NULL
    op.alter_column(
        'audio_files',
        'file_url',
        existing_type=sa.VARCHAR(),
        nullable=False
    )


def downgrade() -> None:
    # Revert file_url back to nullable
    op.alter_column(
        'audio_files',
        'file_url',
        existing_type=sa.VARCHAR(),
        nullable=True
    )

"""create audio_files table

Revision ID: 083785171451
Revises: 92556ecef09a
Create Date: 2025-09-16 16:25:27.391643
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '083785171451'
down_revision: Union[str, None] = '92556ecef09a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ✅ make file_url nullable to avoid IntegrityError
    op.add_column('audio_files', sa.Column('file_url', sa.String(), nullable=True))
    
    # remove audio_data column since we are moving to file_url (storage bucket)
    op.drop_column('audio_files', 'audio_data')


def downgrade() -> None:
    # revert back to previous state
    op.add_column('audio_files', sa.Column('audio_data', postgresql.BYTEA(), autoincrement=False, nullable=False))
    op.drop_column('audio_files', 'file_url')

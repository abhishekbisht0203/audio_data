"""init migration

Revision ID: 48788dc33a1f
Revises: cf5a3babac35
Create Date: 2025-09-19 14:53:41.440599
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48788dc33a1f'
down_revision: Union[str, None] = 'cf5a3babac35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ✅ Make new column nullable first (so migration doesn’t fail)
    op.add_column('audio_files', sa.Column('file_data', sa.LargeBinary(), nullable=True))
    op.drop_column('audio_files', 'file_url')


def downgrade() -> None:
    op.add_column('audio_files', sa.Column('file_url', sa.VARCHAR(), nullable=True))
    op.drop_column('audio_files', 'file_data')

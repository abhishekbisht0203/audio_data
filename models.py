from sqlalchemy import Column, Integer, String, LargeBinary, DateTime, func, JSON
from database import Base

class AudioFile(Base):
    __tablename__ = "audio_files"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    audio_data = Column(LargeBinary, nullable=False)
    file_metadata = Column(JSON)   # <-- renamed from metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())

from sqlalchemy import Column, Integer, String, DateTime, func, JSON, LargeBinary
from app.database import Base

class AudioFile(Base):
    __tablename__ = "audio_files"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    file_data = Column(LargeBinary, nullable=False)   # ✅ raw audio data
    file_metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

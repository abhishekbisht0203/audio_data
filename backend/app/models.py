from sqlalchemy import Column, Integer, String, DateTime, func, JSON
from app.database import Base
# ----------------------------------------------------
from datetime import datetime, timezone
# ----------------------------------------------------

class AudioFile(Base):
    __tablename__ = "audio_files"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    file_metadata = Column(JSON)
    
    # Critical Change for UTC Consistency
    created_at = Column(
        DateTime(timezone=True), 
        server_default=func.now(),
        # This default ensures the object is timezone-aware UTC if created in Python
        default=lambda: datetime.now(timezone.utc) 
    )
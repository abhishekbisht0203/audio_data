import os
import io
import shutil
import uuid
import warnings
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dateutil import parser
from app.database import get_db
from app.models import AudioFile
from app.storage import supabase
from pydub import AudioSegment
import pydub.utils

# ----------------- FFmpeg -----------------
warnings.filterwarnings("ignore", message="Couldn't find ffmpeg")
fallback_dir = r"C:\Users\abhiy\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0-full_build\bin"
ffmpeg_path = shutil.which("ffmpeg") or os.path.join(fallback_dir, "ffmpeg.exe")

if os.path.exists(ffmpeg_path):
    AudioSegment.converter = ffmpeg_path
    AudioSegment.ffmpeg = ffmpeg_path
    pydub.utils.get_encoder_name = lambda: ffmpeg_path
    print(f"[INFO] Using ffmpeg: {ffmpeg_path}")
else:
    raise RuntimeError("FFmpeg not found. Uploads will fail.")

# ----------------- App & CORS -----------------
app = FastAPI(title="Audio API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
BUCKET_NAME = os.getenv("SUPABASE_BUCKET", "audios")

# ----------------- Helpers -----------------
def parse_iso_datetime(dt_str: str) -> datetime:
    try:
        dt = parser.isoparse(dt_str)
        if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")

# ----------------- Routes -----------------
@app.get("/")
def root():
    return {"message": "Audio API is running 🚀"}

@app.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    original_filename = file.filename
    supabase_path = None
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file uploaded.")

        file_ext = original_filename.split(".")[-1].lower()
        audio = AudioSegment.from_file(io.BytesIO(contents), format=file_ext)
        flac_io = io.BytesIO()
        audio.export(flac_io, format="flac")
        flac_data = flac_io.getvalue()

        unique_id = uuid.uuid4()
        supabase_path = f"{unique_id}.flac"

        supabase.storage.from_(BUCKET_NAME).upload(supabase_path, flac_data, {"content-type": "audio/flac"})
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(supabase_path)

        new_file = AudioFile(
            file_name=supabase_path,
            file_metadata={
                "original_filename": original_filename,
                "original_ext": file_ext,
                "uploaded_by": "FastAPI"
            },
        )
        db.add(new_file)
        db.commit()
        db.refresh(new_file)

        return {
            "id": new_file.id,
            "original_file_name": original_filename,
            "stored_name": new_file.file_name,
            "created_at": new_file.created_at.isoformat() if new_file.created_at else None,
            "file_url": public_url,
            "status": "✅ stored in DB and Supabase as FLAC",
        }
    except Exception as e:
        db.rollback()
        if supabase_path:
            try: supabase.storage.from_(BUCKET_NAME).remove([supabase_path])
            except: pass
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/list-audios")
def list_audios(
    start_time: str = Query(None), end_time: str = Query(None), db: Session = Depends(get_db)
):
    query = db.query(AudioFile)
    if start_time: query = query.filter(AudioFile.created_at >= parse_iso_datetime(start_time))
    if end_time: query = query.filter(AudioFile.created_at <= parse_iso_datetime(end_time))
    files = query.order_by(AudioFile.created_at.desc()).all()

    result = []
    for f in files:
        result.append({
            "id": f.id,
            "file_name": f.file_name,
            "file_url": supabase.storage.from_(BUCKET_NAME).get_public_url(f.file_name),
            "metadata": f.file_metadata,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return result

@app.get("/download-audio/{file_id}")
def download_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not file: raise HTTPException(status_code=404, detail="File not found")
    try:
        res = supabase.storage.from_(BUCKET_NAME).download(file.file_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
    return StreamingResponse(io.BytesIO(res), media_type="audio/flac",
                             headers={"Content-Disposition": f'attachment; filename="{file.file_metadata.get("original_filename","audio")}.flac"',
                                      "Content-Length": str(len(res))})

@app.delete("/delete-audio/{file_id}")
def delete_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not file: return {"status": "File not found"}
    try: supabase.storage.from_(BUCKET_NAME).remove([file.file_name])
    except: pass
    db.delete(file)
    db.commit()
    return {"status": "Deleted from DB & Supabase", "id": file_id}

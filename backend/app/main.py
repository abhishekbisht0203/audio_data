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
# Assuming app.database and app.models are correct imports
from app.database import get_db
from app.models import AudioFile # Your confirmed model
from app.storage import supabase
from pydub import AudioSegment
import pydub.utils

# ------------------------------------------------
# 🛠️ Timezone Helper Function
# ------------------------------------------------
def parse_iso_datetime(dt_str: str) -> datetime:
    """
    Robustly parses an ISO 8601 string, makes it timezone-aware if naive,
    and converts it to UTC for consistent database querying.
    (Requires: pip install python-dateutil)
    """
    try:
        dt = parser.isoparse(dt_str)
        
        # If naive (no timezone info provided), assume UTC and make it aware.
        if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
            dt = dt.replace(tzinfo=timezone.utc)
            
        # Convert to UTC for database query consistency
        return dt.astimezone(timezone.utc)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format for filter: {e}. Please use ISO 8601 format (e.g., 2025-01-01T00:00:00+05:30).")


# --- FFmpeg Path Hardening ---
warnings.filterwarnings("ignore", message="Couldn't find ffmpeg")
warnings.filterwarnings("ignore", message="Couldn't find ffprobe")

fallback_dir = r"C:\Users\abhiy\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0-full_build\bin"
ffmpeg_path = shutil.which("ffmpeg") or os.path.join(fallback_dir, "ffmpeg.exe")
ffprobe_path = shutil.which("ffprobe") or os.path.join(fallback_dir, "ffprobe.exe")

if os.path.exists(ffmpeg_path):
    AudioSegment.converter = ffmpeg_path
    AudioSegment.ffmpeg = ffmpeg_path
    pydub.utils.get_encoder_name = lambda: ffmpeg_path
    print(f"[INFO] Using ffmpeg: {ffmpeg_path}")
else:
    raise RuntimeError("❌ FFmpeg not found at the expected location. Uploads will fail.")
# --- End of FFmpeg Path Hardening ---

app = FastAPI(title="Audio Files API with Supabase", version="1.0")

# --- CORS Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- End of CORS Configuration ---

BUCKET_NAME = os.getenv("SUPABASE_BUCKET", "audios")


@app.get("/")
def root():
    return {"message": "Audio API is running 🚀"}


# ==============================
# ✅ Upload Audio (Convert → FLAC)
# ==============================
@app.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    original_filename = file.filename
    supabase_path = None
    
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file uploaded.")

        input_audio = io.BytesIO(contents)
        file_ext = original_filename.split(".")[-1].lower()

        audio = AudioSegment.from_file(input_audio, format=file_ext)
        flac_io = io.BytesIO()
        audio.export(flac_io, format="flac")
        flac_data = flac_io.getvalue()

        unique_id = uuid.uuid4()
        supabase_file_name = f"{unique_id}.flac"
        supabase_path = supabase_file_name

        supabase.storage.from_(BUCKET_NAME).upload(
            supabase_path, flac_data, {"content-type": "audio/flac"}
        )
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(supabase_path)

        new_file = AudioFile(
            file_name=supabase_file_name,
            file_metadata={
                "original_filename": original_filename,
                "original_ext": file_ext,
                "uploaded_by": "FastAPI"
            },
            # created_at will be set by server_default on insert or Python default
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
            "status": "✅ stored in DB and Supabase as FLAC with UUID name",
        }

    except Exception as e:
        db.rollback()
        if supabase_path:
            try:
                supabase.storage.from_(BUCKET_NAME).remove([supabase_path])
                print(f"[CLEANUP] Removed file {supabase_path} from Supabase after DB error.")
            except Exception as cleanup_e:
                print(f"[CLEANUP FAILED] {cleanup_e}")

        print(f"Detailed Upload Error: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Upload failed due to a server or storage issue: {str(e)}"
        )


# ==============================
# ✅ List Audios - FINAL FIX
# ==============================
@app.get("/list-audios")
def list_audios(
    start_time: str = Query(None, description="Start date/time filter (ISO 8601)"),
    end_time: str = Query(None, description="End date/time filter (ISO 8601)"),
    db: Session = Depends(get_db)
):
    query = db.query(AudioFile)

    if start_time:
        # Converts input time (e.g., IST) to timezone-aware UTC for comparison
        start_dt_utc = parse_iso_datetime(start_time) 
        query = query.filter(AudioFile.created_at >= start_dt_utc)
        
    if end_time:
        # Converts input time (e.g., IST) to timezone-aware UTC for comparison
        end_dt_utc = parse_iso_datetime(end_time)
        query = query.filter(AudioFile.created_at <= end_dt_utc)

    files = query.order_by(AudioFile.created_at.desc()).all()

    result = []
    for f in files:
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(f.file_name)
        
        # Ensure 'created_at' is always returned with a timezone in ISO 8601 format
        created_at_iso = f.created_at.isoformat() if f.created_at else None
        
        result.append({
            "id": f.id,
            "file_name": f.file_name,
            "file_url": public_url,
            "metadata": f.file_metadata,
            "created_at": created_at_iso, 
        })
    return result


# ==============================
# ✅ Download Audio (FLAC)
# ==============================
@app.get("/download-audio/{file_id}")
def download_audio(file_id: int, db: Session = Depends(get_db)):
    """
    Download a file from Supabase storage as .flac format using StreamingResponse.
    """
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found in database.")

    supabase_path = file.file_name

    try:
        res = supabase.storage.from_(BUCKET_NAME).download(supabase_path)
    except Exception as e:
        if "The resource was not found" in str(e):
             raise HTTPException(status_code=404, detail="Audio file not found in Supabase Storage.")
        raise HTTPException(status_code=500, detail=f"Failed to fetch file from Supabase: {str(e)}")
    
    audio_bytes_io = io.BytesIO(res)

    original_filename = file.file_metadata.get("original_filename", "audio_download")

    return StreamingResponse(
        content=audio_bytes_io,
        media_type="audio/flac",
        headers={
            "Content-Disposition": f'attachment; filename="{original_filename.rsplit(".", 1)[0]}_download.flac"',
            "Content-Length": str(len(res))
        },
    )


# ==============================
# ✅ Delete Audio
# ==============================
@app.delete("/delete-audio/{file_id}")
def delete_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()

    if not file:
        return {"status": "File not found in DB, nothing deleted"}

    supabase_path = file.file_name
    try:
        supabase.storage.from_(BUCKET_NAME).remove([supabase_path])
    except Exception as e:
        print(f"[WARN] Failed to delete file from Supabase: {e}")

    db.delete(file)
    db.commit()
    return {"status": "🗑️ deleted from DB and Supabase", "id": file_id}
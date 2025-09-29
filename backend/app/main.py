import os
import io
import shutil
import warnings
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AudioFile
from app.storage import supabase
from pydub import AudioSegment
import pydub.utils

# Suppress ffmpeg/ffprobe warnings
warnings.filterwarnings("ignore", message="Couldn't find ffmpeg")
warnings.filterwarnings("ignore", message="Couldn't find ffprobe")

app = FastAPI(title="Audio Files API with Supabase", version="1.0")

# --- CORS Configuration ---
# This is the crucial part that was missing from your code.
# It allows requests from your Expo app's URL (and others).
origins = [
    "http://localhost",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://10.0.2.2:8000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- End of CORS Configuration ---

BUCKET_NAME = os.getenv("SUPABASE_BUCKET", "audios")

# Detect ffmpeg and ffprobe
ffmpeg_path = shutil.which("ffmpeg")
ffprobe_path = shutil.which("ffprobe")

fallback_path = r"C:\Users\abhiy\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0-full_build\bin"

if not ffmpeg_path:
    ffmpeg_path = os.path.join(fallback_path, "ffmpeg.exe")
if not ffprobe_path:
    ffprobe_path = os.path.join(fallback_path, "ffprobe.exe")

if not os.path.exists(ffmpeg_path) or not os.path.exists(ffprobe_path):
    raise RuntimeError("❌ ffmpeg/ffprobe not found. Install FFmpeg and ensure it is in PATH.")

AudioSegment.converter = ffmpeg_path
AudioSegment.ffmpeg = ffmpeg_path
AudioSegment.ffprobe = ffprobe_path
pydub.utils.get_encoder_name = lambda: ffmpeg_path

print(f"[INFO] Using ffmpeg: {ffmpeg_path}")
print(f"[INFO] Using ffprobe: {ffprobe_path}")


@app.get("/")
def root():
    return {"message": "Audio API is running 🚀"}


@app.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file uploaded.")

        input_audio = io.BytesIO(contents)
        file_ext = file.filename.split(".")[-1].lower()

        # Convert to FLAC
        audio = AudioSegment.from_file(input_audio, format=file_ext)
        flac_io = io.BytesIO()
        audio.export(flac_io, format="flac")
        flac_data = flac_io.getvalue()

        flac_filename = file.filename.rsplit(".", 1)[0] + ".flac"

        # Save in DB
        new_file = AudioFile(
            file_name=flac_filename,
            file_data=flac_data,
            file_metadata={"original_ext": file_ext, "uploaded_by": "FastAPI"},
        )
        db.add(new_file)
        db.commit()
        db.refresh(new_file)

        # Save to Supabase
        supabase_path = f"{flac_filename}"
        supabase.storage.from_(BUCKET_NAME).upload(
            supabase_path, flac_data, {"content-type": "audio/flac"}
        )
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(supabase_path)

        return {
            "id": new_file.id,
            "file_name": new_file.file_name,
            "created_at": new_file.created_at,
            "file_url": public_url,
            "status": "✅ stored in DB and Supabase as FLAC",
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(e)}")


@app.get("/list-audios")
def list_audios(db: Session = Depends(get_db)):
    files = db.query(AudioFile).all()
    result = []
    for f in files:
        # Dynamically generate public URL
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(f.file_name)
        result.append({
            "id": f.id,
            "file_name": f.file_name,
            "file_url": public_url,
            "metadata": f.file_metadata,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return result


@app.get("/download-audio/{file_id}")
def download_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()

    if file and file.file_data:
        # Serve from DB if available
        return StreamingResponse(
            io.BytesIO(file.file_data),
            media_type="audio/flac",
            headers={"Content-Disposition": f"attachment; filename={file.file_name}"},
        )
    else:
        # Fallback: Serve from Supabase
        supabase_path = None
        if file:
            supabase_path = file.file_name
        else:
            raise HTTPException(status_code=404, detail="File not found")

        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(supabase_path)
        return {"file_url": public_url, "message": "File served from Supabase"}


@app.delete("/delete-audio/{file_id}")
def delete_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()

    if file:
        supabase_path = file.file_name
        supabase.storage.from_(BUCKET_NAME).remove([supabase_path])
        db.delete(file)
        db.commit()
        return {"status": "🗑️ deleted from DB and Supabase", "id": file_id}
    else:
        return {"status": "File not found in DB, nothing deleted" }
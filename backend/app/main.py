import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AudioFile
from app.storage import supabase  # ✅ our Supabase client from storage.py

app = FastAPI(title="Audio Files API with Supabase", version="0.4")

# bucket name (must exist in Supabase)
BUCKET_NAME = os.getenv("SUPABASE_BUCKET", "audios")


@app.get("/")
def root():
    return {"ok": True}


# ✅ Upload API (stores file in Supabase + DB row with URL)
@app.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()

    supabase_path = f"audios/{file.filename}"

    supabase.storage.from_(BUCKET_NAME).upload(
        supabase_path,
        contents,
        file_options={"upsert": "true"}  # ✅ fixed
    )

    file_url = supabase.storage.from_(BUCKET_NAME).get_public_url(supabase_path)

    new_file = AudioFile(
        file_name=file.filename,
        file_url=file_url,
        file_metadata={"uploaded_by": "FastAPI"},
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    return {
        "id": new_file.id,
        "file_name": new_file.file_name,
        "file_url": new_file.file_url,
        "created_at": new_file.created_at,
        "status": "saved to Supabase Storage + DB",
    }



# ✅ List Uploads API (returns URLs)
@app.get("/list-audios")
def list_audios(db: Session = Depends(get_db)):
    files = db.query(AudioFile).all()
    return [
        {
            "id": f.id,
            "file_name": f.file_name,
            "file_url": f.file_url,
            "metadata": f.file_metadata,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in files
    ]


# ✅ Delete file (removes from Supabase + DB)
@app.delete("/delete-audio/{file_id}")
def delete_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    supabase_path = f"audios/{file.file_name}"

    # Remove from Supabase Storage
    supabase.storage.from_(BUCKET_NAME).remove([supabase_path])

    # Remove from DB
    db.delete(file)
    db.commit()

    return {"status": "deleted", "id": file_id}

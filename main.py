from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import AudioFile

app = FastAPI(title="Audio Files API with ORM", version="0.3")


@app.get("/")
def root():
    return {"ok": True}


# ✅ Upload API
@app.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = file.filename
    data = await file.read()

    new_file = AudioFile(
        file_name=filename,
        audio_data=data,
        file_metadata={"uploaded_by": "FastAPI"}  # updated
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    return {
        "id": new_file.id,
        "file_name": new_file.file_name,
        "created_at": new_file.created_at,
        "status": "saved to PostgreSQL (ORM via Alembic-managed DB)"
    }


# ✅ List Uploads API
@app.get("/list-audios")
def list_audios(db: Session = Depends(get_db)):
    files = db.query(AudioFile).all()
    return [
        {
            "id": f.id,
            "file_name": f.file_name,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "metadata": f.file_metadata   # updated
        }
        for f in files
    ]


@app.get("/download-audio/{file_id}")
def download_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    return StreamingResponse(
        iter([file.audio_data]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file.file_name}"'}
    )


@app.delete("/delete-audio/{file_id}")
def delete_audio(file_id: int, db: Session = Depends(get_db)):
    file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    db.delete(file)
    db.commit()
    return {"status": "deleted", "id": file_id}

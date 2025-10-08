# Use Python slim image
FROM python:3.11-slim

# Env settings
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (added portaudio19-dev and ffmpeg if needed)
RUN apt-get update && \
    apt-get install -y build-essential libpq-dev portaudio19-dev ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Copy dependencies
COPY requirements.txt .

# Install deps
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend ./backend

# Expose FastAPI
EXPOSE 8000

# Run app (pointing to backend/app/main.py)
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

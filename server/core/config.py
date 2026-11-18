from pathlib import Path

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
META_FILE = STORAGE_DIR / "uploads_meta.json"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
CORS_ORIGINS = ["http://localhost:5173"]

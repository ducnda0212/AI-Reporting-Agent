import hashlib
import re
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.file import UploadedFile


def save_and_fingerprint(
    file_bytes: bytes, filename: str, cycle_id: str, db: Session, force_reload: bool
) -> tuple[UploadedFile, bool]:
    """Store the upload once per (cycle, SHA256). Returns (record, is_duplicate).

    A repeat of the same bytes in the same cycle reuses the stored record; `is_duplicate`
    is True only when the caller did not ask to force a reload.
    """
    if not re.fullmatch(r"[A-Za-z0-9_-]+", cycle_id or ""):
        raise ValueError("invalid cycle_id")
    sha = hashlib.sha256(file_bytes).hexdigest()
    existing = db.query(UploadedFile).filter_by(cycle_id=cycle_id, sha256=sha).order_by(UploadedFile.id).first()
    if existing is not None:
        return existing, not force_reload

    safe_name = re.sub(r"[^\w.-]", "_", re.split(r"[\\/]", filename or "upload")[-1]).lstrip(".") or "upload"
    folder = Path(settings.UPLOADS_DIR) / cycle_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{datetime.now():%Y%m%d_%H%M%S}_{sha[:8]}_{safe_name}"
    path.write_bytes(file_bytes)
    record = UploadedFile(cycle_id=cycle_id, original_name=filename, stored_path=str(path), sha256=sha)
    db.add(record)
    db.commit()
    return record, False

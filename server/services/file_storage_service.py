import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel

from server.core import config


class FileMetadata(BaseModel):
    id: str
    filename: str
    file_path: str
    file_hash: str
    file_size: int
    uploaded_at: str
    total_issues: int
    total_cols: int
    target_month: str = ""  # default so pre-period entries still load
    target_week: str


def _safe_filename(name: str) -> str:
    base = re.split(r"[\\/]", name)[-1]  # drops path components and drive dirs
    base = re.sub(r'[<>:"|?*\x00-\x1f]', "_", base)[-100:].strip(" .")  # tail keeps the extension; stays under Windows MAX_PATH
    return base or "upload.csv"


class FileStorageService:
    # shortcut: whole-file JSON rewrite with no lock, fine for single-process use; move to a DB if concurrent.
    def _read(self) -> list[FileMetadata]:
        path = Path(config.META_FILE)
        if not path.exists():
            return []
        try:
            return [FileMetadata(**d) for d in json.loads(path.read_text(encoding="utf-8"))]
        except (ValueError, TypeError):
            os.replace(path, path.with_name(path.name + ".corrupt"))
            return []

    def _write(self, items: list[FileMetadata]) -> None:
        path = Path(config.META_FILE)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps([m.model_dump() for m in items], ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)

    def check_duplicate(self, content: bytes, target_month: str, target_week: str) -> tuple[bool, FileMetadata | None]:
        h = hashlib.sha256(content).hexdigest()
        for m in reversed(self._read()):  # appended in time order, so newest first
            if m.file_hash == h and m.target_month == target_month and m.target_week == target_week:
                return True, m
        return False, None

    def save_file(self, content: bytes, filename: str, target_month: str, target_week: str, total_issues: int, total_cols: int) -> FileMetadata:
        h = hashlib.sha256(content).hexdigest()
        now = datetime.now(timezone.utc)
        uploads = Path(config.UPLOADS_DIR)
        uploads.mkdir(parents=True, exist_ok=True)
        safe = _safe_filename(filename)
        dest = uploads / f"{now.strftime('%Y%m%dT%H%M%S%fZ')}_{h[:8]}_{safe}"
        dest.write_bytes(content)
        meta = FileMetadata(
            id=uuid.uuid4().hex, filename=safe, file_path=str(dest), file_hash=h,
            file_size=len(content), uploaded_at=now.isoformat(), total_issues=total_issues,
            total_cols=total_cols, target_month=target_month, target_week=target_week,
        )
        self._write([*self._read(), meta])
        return meta

    def get_history(self, target_month: str | None = None) -> list[FileMetadata]:
        return [m for m in reversed(self._read()) if target_month is None or m.target_month == target_month]

    def get_file_by_id(self, file_id: str) -> tuple[FileMetadata, bytes]:
        for m in self._read():
            if m.id == file_id:
                return m, Path(m.file_path).read_bytes()
        raise KeyError(f"Unknown file id: {file_id}")

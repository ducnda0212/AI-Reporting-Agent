import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile

from server.core import config
from server.parsers.jira_csv_parser import parse_jira_csv
from server.services.file_storage_service import FileStorageService

router = APIRouter(prefix="/api/import")
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_WEEKS = {"w1", "w2", "w3", "w4"}


def _check_month(m: str):
    if not _MONTH_RE.match(m):
        raise HTTPException(400, "target_month must be YYYY-MM")


def _check_week(w: str):
    if w not in _WEEKS:
        raise HTTPException(400, "target_week must be one of w1..w4")


def _parse(content: bytes):
    try:
        return parse_jira_csv(content)
    except ValueError as e:
        raise HTTPException(400, f"Invalid Jira CSV: {e}")


def _payload(meta, parsed, is_duplicate: bool) -> dict:
    return {
        "file_info": {
            "id": meta.id, "filename": meta.filename, "is_duplicate": is_duplicate,
            "file_hash": meta.file_hash, "file_size": meta.file_size,
            "uploaded_at": meta.uploaded_at, "target_week": meta.target_week, "target_month": meta.target_month,
        },
        "file_stats": {**parsed.stats, "target_month": meta.target_month, "target_week": meta.target_week, "loaded_at": datetime.now(timezone.utc).isoformat()},
        "columns": [c.model_dump() for c in parsed.columns],
        # _raw_by_index is large and has int keys; the UI only needs named values
        "issues_sample": [{k: v for k, v in i.items() if k != "_raw_by_index"} for i in parsed.issues[:5]],
    }


@router.post("/upload")
def upload(file: UploadFile, target_week: str = "w3", target_month: str = "2026-11"):
    _check_week(target_week)
    _check_month(target_month)
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, "Only .csv files are accepted")
    limit = config.MAX_UPLOAD_BYTES
    content = file.file.read(limit + 1)  # don't trust Content-Length
    if len(content) > limit:
        raise HTTPException(400, f"File exceeds {limit} bytes")
    if not content:
        raise HTTPException(400, "File is empty")
    parsed = _parse(content)  # parse before saving so invalid files are never stored
    svc = FileStorageService()
    dup, existing = svc.check_duplicate(content, target_month, target_week)
    if dup:
        return _payload(existing, parsed, True)
    meta = svc.save_file(content, file.filename, target_month, target_week,
                         parsed.stats["total_issues"], parsed.stats["total_cols"])
    return _payload(meta, parsed, False)


@router.get("/history")
def history(target_month: str | None = None):
    if target_month is not None:
        _check_month(target_month)
    return [m.model_dump(exclude={"file_path"}) for m in FileStorageService().get_history(target_month)]


@router.get("/history/{file_id}")
def history_detail(file_id: str):
    try:
        meta, content = FileStorageService().get_file_by_id(file_id)
    except (KeyError, FileNotFoundError):
        raise HTTPException(404, "File not found")
    return _payload(meta, _parse(content), False)

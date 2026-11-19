import json
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from server.app.core.config import settings
from server.app.core.database import get_db
from server.app.models.session import IngestSession
from server.app.modules.ingestion.cycles import weeks_for_cycle
from server.app.modules.ingestion.file_handler import save_and_fingerprint
from server.app.modules.ingestion.service import latest_session, run_pipeline
from server.app.modules.mapping.csv_cleaner import InvalidSchemaError
from server.app.schemas.ingest import IngestResponse, WarningIssue

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])
ALLOWED_EXT = {".csv", ".tsv", ".txt"}  # shortcut: .xlsx/.xls parsing is not built yet (spec §4.1)


def _err(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _check_cycle(cycle_id: str) -> None:
    try:
        weeks_for_cycle(cycle_id)
    except ValueError:
        raise _err(422, "E_CYCLE_INVALID", f"cycle_id không hợp lệ: {cycle_id!r} (vd 2026_11_w3)")


def _process(content: bytes, cycle_id: str, previous: IngestSession | None):
    try:
        return run_pipeline(content, cycle_id, previous)
    except InvalidSchemaError as e:
        raise _err(422, "E_FILE_INVALID_SCHEMA", str(e))


@router.post("/upload", response_model=IngestResponse)
async def upload(
    file: UploadFile = File(...),
    cycle_id: str = Form(...),
    force_reload: bool = Form(False),
    db: Session = Depends(get_db),
):
    if os.path.splitext(file.filename or "")[1].lower() not in ALLOWED_EXT:
        raise _err(422, "E_FILE_UNSUPPORTED_FORMAT", "Chỉ hỗ trợ .csv, .tsv, .txt")
    _check_cycle(cycle_id)
    content = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(content) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise _err(413, "E_FILE_TOO_LARGE", f"File vượt {settings.MAX_UPLOAD_MB}MB")

    record, is_duplicate = save_and_fingerprint(content, file.filename, cycle_id, db, force_reload)
    if is_duplicate:
        cached = db.query(IngestSession).filter_by(file_id=record.id).order_by(IngestSession.created_at.desc()).first()
        if cached is not None:
            cached_resp = IngestResponse.model_validate_json(cached.response_json)
            note = WarningIssue(
                code="W_DUPLICATE_FILE", key=record.original_name,
                message=f"File này đã được nạp trước đó vào lúc {record.uploaded_at:%H:%M %d/%m} bởi {record.uploaded_by}",
            )
            return cached_resp.model_copy(update={"is_duplicate_file": True, "warnings": [*cached_resp.warnings, note]})

    response, source_rows, headers = _process(content, cycle_id, latest_session(db, cycle_id))
    db.add(IngestSession(
        id=response.session_id, cycle_id=cycle_id, file_id=record.id,
        headers_json=json.dumps(headers, ensure_ascii=False), source_rows_json=json.dumps([r.model_dump(mode="json") for r in source_rows], ensure_ascii=False),
        response_json=response.model_dump_json(),
    ))
    record.row_count, record.col_count, record.status = response.file_stats.total_rows, len(headers), "parsed"
    db.commit()
    return response


class DemoRequest(BaseModel):
    cycle_id: str = settings.DEFAULT_CYCLE_ID


@router.post("/demo", response_model=IngestResponse)
def demo(req: DemoRequest):
    _check_cycle(req.cycle_id)
    with open(os.path.join(settings.FIXTURES_DIR, "golden_dataset.csv"), "rb") as f:
        return _process(f.read(), req.cycle_id, None)[0]

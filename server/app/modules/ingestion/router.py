import os

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from server.app.core.config import settings
from server.app.core.database import get_db
from server.app.core.errors import api_error, from_service_error
from server.app.models.session import IngestSession
from server.app.modules.ingestion.cycles import weeks_for_cycle
from server.app.modules.ingestion.file_handler import save_and_fingerprint
from server.app.modules.ingestion.service import DEMO_USER, latest_session, run_pipeline, save_session
from server.app.modules.mapping.csv_cleaner import InvalidSchemaError
from server.app.modules.mapping.service import mapping_or_default
from server.app.schemas.ingest import IngestResponse, WarningIssue

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])
ALLOWED_EXT = {".csv", ".tsv", ".txt"}  # shortcut: .xlsx/.xls parsing is not built yet (spec §4.1)


_err = api_error


def _check_cycle(cycle_id: str) -> None:
    try:
        weeks_for_cycle(cycle_id)
    except ValueError:
        raise _err(422, "E_CYCLE_INVALID", f"cycle_id không hợp lệ: {cycle_id!r} (vd 2026_11_w3)")


def _mapping(db: Session, mapping_id: str | None):
    try:
        return mapping_or_default(db, mapping_id)
    except LookupError as e:
        raise from_service_error(e, 404)


def _process(content: bytes, cycle_id: str, previous: IngestSession | None, mapping=None):
    try:
        return run_pipeline(content, cycle_id, previous, mapping)
    except InvalidSchemaError as e:
        raise _err(422, "E_FILE_INVALID_SCHEMA", str(e))


@router.post("/upload", response_model=IngestResponse)
async def upload(
    file: UploadFile = File(...),
    cycle_id: str = Form(...),
    force_reload: bool = Form(False),
    mapping_id: str | None = Form(None),  # None = system default mapping
    db: Session = Depends(get_db),
):
    if os.path.splitext(file.filename or "")[1].lower() not in ALLOWED_EXT:
        raise _err(422, "E_FILE_UNSUPPORTED_FORMAT", "Chỉ hỗ trợ .csv, .tsv, .txt")
    _check_cycle(cycle_id)
    mapping = _mapping(db, mapping_id)
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

    response, source_rows, headers = _process(content, cycle_id, latest_session(db, cycle_id), mapping)
    save_session(db, cycle_id, record.id, response, source_rows, headers)
    record.row_count, record.col_count, record.status = response.file_stats.total_rows, len(headers), "parsed"
    db.commit()
    return response


class DemoRequest(BaseModel):
    cycle_id: str = settings.DEFAULT_CYCLE_ID
    mapping_id: str | None = None


@router.post("/demo", response_model=IngestResponse)
def demo(req: DemoRequest, db: Session = Depends(get_db)):
    """Golden dataset as a stored session (so it can be recalculated/drafted); never the baseline of a real upload's diff."""
    _check_cycle(req.cycle_id)
    mapping = _mapping(db, req.mapping_id)
    with open(os.path.join(settings.FIXTURES_DIR, "golden_dataset.csv"), "rb") as f:
        content = f.read()
    record, _ = save_and_fingerprint(content, "golden_dataset.csv", f"demo_{req.cycle_id}", db, True)
    if record.uploaded_by != DEMO_USER:
        record.uploaded_by = DEMO_USER
    response, source_rows, headers = _process(content, req.cycle_id, None, mapping)
    save_session(db, req.cycle_id, record.id, response, source_rows, headers)
    return response

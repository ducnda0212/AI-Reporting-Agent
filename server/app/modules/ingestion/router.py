from datetime import date
import json
import os

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from server.app.core.config import settings
from server.app.core.database import get_db
from server.app.core.errors import api_error, from_service_error
from server.app.models.file import UploadedFile
from server.app.models.session import IngestSession
from server.app.modules.ingestion.cycles import active_cycle, current_week, cycle_for_date, weeks_for_cycle, week_name
from server.app.modules.ingestion.file_handler import save_and_fingerprint
from server.app.modules.ingestion.service import latest_session, run_pipeline, save_session
from server.app.modules.mapping.csv_cleaner import InvalidSchemaError
from server.app.modules.mapping.service import mapping_or_default
from server.app.modules.mapping.tabular_reader import CSV_EXT, XLSX_EXT, UnsupportedFormatError
from server.app.schemas.cycle import ActiveCycle
from server.app.schemas.ingest import ImportFileMeta, IngestResponse, WarningIssue

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])


def _today() -> date:
    return date.today()


cycles_router = APIRouter(prefix="/api/v1/cycles", tags=["cycles"])
ALLOWED_EXT = CSV_EXT | XLSX_EXT
HISTORY_LIMIT = 10


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


def _process(content: bytes, filename: str, cycle_id: str, baseline: IngestSession | None, mapping=None):
    try:
        return run_pipeline(content, filename, cycle_id, baseline, mapping)
    except UnsupportedFormatError as e:
        raise from_service_error(e, 422)
    except InvalidSchemaError as e:
        raise _err(422, "E_FILE_INVALID_SCHEMA", str(e).removeprefix("E_FILE_INVALID_SCHEMA: "))


@router.post("/upload", response_model=IngestResponse)
async def upload(
    file: UploadFile = File(...),
    cycle_id: str = Form(...),
    force_reload: bool = Form(False),
    mapping_id: str | None = Form(None),  # None = system default mapping
    db: Session = Depends(get_db),
):
    if os.path.splitext(file.filename or "")[1].lower() not in ALLOWED_EXT:
        raise _err(422, "E_FILE_UNSUPPORTED_FORMAT", "Chỉ hỗ trợ .csv, .tsv, .txt, .xlsx, .xlsm (hãy lưu .xls sang .xlsx)")
    _check_cycle(cycle_id)
    mapping = _mapping(db, mapping_id)
    content = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(content) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise _err(413, "E_FILE_TOO_LARGE", f"File vượt {settings.MAX_UPLOAD_MB}MB")

    record, is_duplicate = save_and_fingerprint(content, file.filename, cycle_id, db, force_reload)
    if is_duplicate:
        cached = db.query(IngestSession).filter_by(file_id=record.id).order_by(IngestSession.created_at.desc()).first()
        try:
            cached_resp = IngestResponse.model_validate_json(cached.response_json) if cached else None
        except ValidationError:  # stored before the response contract changed: reprocess instead of failing
            cached_resp = None
        if cached_resp is not None:
            note = WarningIssue(
                code="W_DUPLICATE_FILE", key=record.original_name,
                message=f"File này đã được nạp trước đó vào lúc {record.uploaded_at:%H:%M %d/%m} bởi {record.uploaded_by}",
            )
            return cached_resp.model_copy(update={"is_duplicate_file": True, "warnings": [*cached_resp.warnings, note]})

    baseline = latest_session(db, cycle_id)
    response, source_rows, headers = _process(content, file.filename, cycle_id, baseline, mapping)
    save_session(db, cycle_id, record.id, response, source_rows, headers, baseline.id if baseline else None)
    record.row_count, record.col_count, record.status = response.file_stats.total_rows, len(headers), "parsed"
    db.commit()
    return response


@router.get("/history", response_model=list[ImportFileMeta])
def history(db: Session = Depends(get_db)):
    """Newest uploads first; sessions stored under an older response contract are skipped."""
    out = []
    q = (db.query(IngestSession, UploadedFile).join(UploadedFile, UploadedFile.id == IngestSession.file_id)
         .order_by(IngestSession.created_at.desc()).limit(HISTORY_LIMIT * 3))
    for sess, f in q:
        try:
            stats = json.loads(sess.response_json)["file_stats"]
            cols = stats["total_cols"]
        except (KeyError, ValueError):
            continue
        weeks = weeks_for_cycle(sess.cycle_id)
        wk = next(w for w in weeks if w["week"] == current_week(sess.cycle_id))
        out.append(ImportFileMeta(
            session_id=sess.id, name=f.original_name, wk=week_name(sess.cycle_id, wk), at=f"{sess.created_at:%d/%m %H:%M}",
            by=f.uploaded_by, issues=stats["total_rows"], cols=cols, prj=stats["matched_projects"],
        ))
    return out[:HISTORY_LIMIT]


@cycles_router.get("/active", response_model=ActiveCycle)
def active():
    if settings.DEFAULT_CYCLE_ID:
        return active_cycle(settings.DEFAULT_CYCLE_ID)
    today = _today()
    return active_cycle(cycle_for_date(today), today)

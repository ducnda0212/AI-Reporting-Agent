import json
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from server.app.core.database import get_db
from server.app.core.errors import from_service_error
from server.app.models.session import SessionDraft
from server.app.models.version import ReportVersion
from server.app.modules.reporting.excel_builder import build_excel_from_version
from server.app.modules.reporting.service import get_version, list_versions, lock_report
from server.app.schemas.reporting import ExportExcelRequest, LockReportRequest, VersionOut

router = APIRouter(prefix="/api/v1/reports", tags=["reporting"])
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _file_response(path: Path, name: str) -> FileResponse:
    q = quote(name)
    return FileResponse(path, media_type=XLSX_MIME, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{q}", "X-Exported-Filename": q})


def _log_export(db: Session, v: ReportVersion, name: str) -> None:
    draft = db.get(SessionDraft, v.session_id)
    if draft is None:
        return
    now = datetime.now()
    draft.log_seq += 1
    logs = json.loads(draft.audit_logs_json)
    logs.append({"t": f"{now:%H:%M}", "day": f"{now:%d/%m/%Y}", "seq": draft.log_seq, "a": "Xuất báo cáo", "o": name,
                 "d": f"{v.wk} v{v.version_no}", "r": ""})
    draft.audit_logs_json = json.dumps(logs, ensure_ascii=False)


@router.get("/versions", response_model=list[VersionOut])
def versions(cycle_month: str | None = None, wk: str | None = None, db: Session = Depends(get_db)):
    return list_versions(db, cycle_month, wk)


@router.post("/lock", response_model=VersionOut)
def lock(req: LockReportRequest, db: Session = Depends(get_db)):
    try:
        return lock_report(db, req)
    except LookupError as e:
        raise from_service_error(e, 404)
    except ValueError as e:
        raise from_service_error(e, 422)


def _version_or_404(db: Session, version_id: str) -> ReportVersion:
    try:
        return get_version(db, version_id)
    except LookupError as e:
        raise from_service_error(e, 404)


@router.post("/export-excel")
def export_excel(req: ExportExcelRequest, db: Session = Depends(get_db)):
    v = _version_or_404(db, req.version_id)
    path, name = build_excel_from_version(
        v, req.ex_cols, req.hidden, req.only_current_week, req.append_override_note, req.file_name)
    v.exported_file, v.export_path = name, str(path)
    _log_export(db, v, name)
    db.commit()
    return _file_response(path, name)


@router.get("/export-excel")
def reexport_excel(version_id: str, db: Session = Depends(get_db)):
    """Re-download the file last exported from a version (rebuilt from its snapshot if it was never exported)."""
    v = _version_or_404(db, version_id)
    if v.export_path and v.exported_file and Path(v.export_path).exists():
        return _file_response(Path(v.export_path), v.exported_file)
    path, name = build_excel_from_version(v)
    v.exported_file, v.export_path = name, str(path)
    db.commit()
    return _file_response(path, name)

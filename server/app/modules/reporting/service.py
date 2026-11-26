import json
import re
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from server.app.core.config import settings
from server.app.models.session import IngestSession, SessionDraft
from server.app.models.version import ReportVersion
from server.app.modules.ingestion.cycles import cycle_for_date, weeks_for_cycle
from server.app.modules.mapping.seed import default_columns
from server.app.schemas.reporting import LockReportRequest, VerEditEntry, VersionOut, VersionStats

# Client `EDIT_RE` (lib/versions.ts): which audit-log actions count as an edit of the locked report.
EDIT_RE = re.compile(r"^(Sửa|Duyệt|Điền|Hoàn tác|Bỏ nháp|Ghép|Gọi AI|Nhờ AI|Agent|Thêm|Xoá|Xóa|Gửi yêu cầu|Đồng ý|Quy đổi)")


def _column_labels() -> dict[str, str]:
    """field id -> "F PIC" (column letter + name), the label the client shows in a version's changes."""
    return {c["field_id"]: f"{c['col_letter']} {c['name']}" for c in default_columns() if c["field_id"] != "x"}


def active_cycle_month() -> str:
    return (settings.DEFAULT_CYCLE_ID or cycle_for_date(date.today()))[:7]


def _diff(old: dict, new: dict) -> list[list[str | None]]:
    labels = _column_labels()
    out: list[list[str | None]] = []
    for key in dict.fromkeys([*new, *old]):
        ma, _, fid = key.partition("|")
        if fid in labels and (old.get(key) or None) != (new.get(key) or None):
            out.append([ma, labels[fid], old.get(key), new.get(key)])
    return out


def _draft_edits(draft: SessionDraft) -> list[VerEditEntry]:
    logs = json.loads(draft.audit_logs_json)
    return [VerEditEntry(**{k: e.get(k, "") for k in ("t", "day", "a", "o", "d")})
            for e in logs if e.get("seq", 0) > draft.lock_seq and EDIT_RE.match(e.get("a", ""))]


def lock_report(db: Session, req: LockReportRequest) -> VersionOut:
    if db.get(IngestSession, req.session_id) is None:
        raise LookupError("E_SESSION_NOT_FOUND")
    by = req.by.strip()
    if not by:
        raise ValueError("E_LOCK_BY_REQUIRED")
    try:
        weeks_for_cycle(req.cycle_id)
    except ValueError:
        raise ValueError("E_CYCLE_INVALID") from None
    month = req.cycle_id[:7]
    prev = db.scalars(select(ReportVersion).where(ReportVersion.cycle_month == month, ReportVersion.wk == req.wk)
                      .order_by(ReportVersion.version_no.desc())).first()
    draft = db.get(SessionDraft, req.session_id)
    edits = req.edits if req.edits is not None else (_draft_edits(draft) if draft else [])
    stats = req.stats or VersionStats(rows=len({k.partition("|")[0] for k in req.snap}))
    no = (prev.version_no if prev else 0) + 1
    now = datetime.now()
    dump = lambda x: json.dumps(x, ensure_ascii=False)  # noqa: E731
    version = ReportVersion(
        id=f"ver_{month}_{req.wk}_v{no}", session_id=req.session_id, cycle_id=req.cycle_id, cycle_month=month,
        wk=req.wk, version_no=no, locked_by=by, locked_at=now, at_label=f"{now:%d/%m %H:%M}", note=req.note,
        file_name=req.file_name, snap_json=dump(req.snap), raw_notes_json=dump(req.raw_notes), fmt_json=dump(req.fmt),
        wrap_json=dump(req.wrap), hidden_json=dump(req.hidden), stats_json=dump(stats.model_dump()),
        changes_json=dump(_diff(json.loads(prev.snap_json) if prev else {}, req.snap)),
        edits_json=dump([e.model_dump() for e in edits]),
    )
    db.add(version)
    if draft:
        draft.lock_by, draft.lock_seq = by, req.log_seq
    db.commit()
    return version_to_out(version)


def get_version(db: Session, version_id: str) -> ReportVersion:
    version = db.get(ReportVersion, version_id)
    if version is None:
        raise LookupError("E_VERSION_NOT_FOUND")
    return version


def list_versions(db: Session, cycle_month: str | None = None, wk: str | None = None) -> list[VersionOut]:
    """Newest first. No `cycle_month` = the active cycle's month; "all" = every month."""
    month = cycle_month or active_cycle_month()
    q = select(ReportVersion)
    if month != "all":
        q = q.where(ReportVersion.cycle_month == month)
    if wk:
        q = q.where(ReportVersion.wk == wk)
    return [version_to_out(v) for v in db.scalars(q.order_by(ReportVersion.wk.desc(), ReportVersion.version_no.desc()))]


def version_to_out(v: ReportVersion) -> VersionOut:
    return VersionOut(
        id=v.id, session_id=v.session_id, cycle_id=v.cycle_id, wk=v.wk, v=v.version_no, by=v.locked_by, at=v.at_label,
        note=v.note, exported=v.exported_file, fileName=v.file_name, stats=json.loads(v.stats_json),
        changes=json.loads(v.changes_json), snap=json.loads(v.snap_json), fmt=json.loads(v.fmt_json),
        wrap=json.loads(v.wrap_json), hidden=json.loads(v.hidden_json), edits=json.loads(v.edits_json),
    )

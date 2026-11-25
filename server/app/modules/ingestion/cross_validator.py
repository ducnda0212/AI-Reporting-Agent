"""Logical cross-checks (warnings only): report says on-track but the text/dates disagree."""
import re
from datetime import date, datetime

from server.app.modules.mapping.normalizer import PROGRESS_VALUES, STATUS_VALUES, normalize_status
from server.app.schemas.ingest import WarningIssue
from server.app.schemas.row import WEEK_TEXT, ReportRow

FINISHED = ("Đã hoàn thành", "Hủy")
RISK_WORDS = re.compile(r"blocker|lùi lịch|chậm|delay|hoãn|vướng|vỡ sla", re.I)


def is_active(row: ReportRow) -> bool:
    return row.tt not in FINISHED


def _week_text(row: ReportRow, kind: str) -> list[str]:
    return [getattr(row, f) for f in WEEK_TEXT[kind]]


def _due(row: ReportRow) -> date | None:
    try:
        return datetime.strptime(row.end, "%d/%m/%Y").date()
    except ValueError:
        return None


def progress_conflicts(rows: list[ReportRow], ref_date: date) -> list[WarningIssue]:
    out = []
    for r in rows:
        if r.td != "Đúng tiến độ" or not is_active(r):
            continue
        reasons = []
        if any(t.strip() for t in _week_text(r, "issues")):  # wiki "# *Blockers:*" / Risk Notes land here
            reasons.append("có Blockers/rủi ro ghi nhận")
        if any(RISK_WORDS.search(t) for t in _week_text(r, "done") + _week_text(r, "plan")):
            reasons.append("nội dung tuần nhắc chậm/lùi lịch")
        if (due := _due(r)) and due < ref_date:
            reasons.append(f"đã quá hạn {r.end}")
        if reasons:
            out.append(WarningIssue(
                code="W_PROGRESS_CONFLICT", key=r.key or r.ma, field="td",
                message=f"{r.ma}: 'Đúng tiến độ' nhưng " + "; ".join(reasons),
            ))
    return out


def unmapped_values(rows: list[ReportRow]) -> list[WarningIssue]:
    out = []
    for r in rows:
        for field, value, allowed in (("tt", r.tt, STATUS_VALUES), ("td", r.td, PROGRESS_VALUES)):
            empty_ok = field == "tt" or not is_active(r)
            if (value and value not in allowed) or (not value and not empty_ok):
                out.append(WarningIssue(
                    code="W_UNMAPPED_VALUE", key=r.key or r.ma, field=field,
                    message=f"{r.ma}: giá trị '{value}' chưa có trong bảng quy đổi" if value
                    else f"{r.ma}: thiếu giá trị {field}",
                ))
    return out


def unmapped_subtask_statuses(rows: list[ReportRow]) -> list[WarningIssue]:
    """Data quality only: a subtask status is never rolled up into its parent (Choice A)."""
    return [
        WarningIssue(code="W_UNMAPPED_VALUE", key=s.key, field="subtasks.status",
                     message=f"{s.key}: trạng thái '{s.status}' chưa có trong bảng quy đổi")
        for r in rows for s in r.subtasks
        if s.status and normalize_status(s.status) not in STATUS_VALUES
    ]

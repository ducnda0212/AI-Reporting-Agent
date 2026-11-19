"""Logical cross-checks (warnings only): report says on-track but the text/dates disagree."""
import re
from datetime import date

from server.app.modules.mapping.normalizer import PROGRESS_VALUES, STATUS_VALUES, normalize_status
from server.app.schemas.ingest import WarningIssue
from server.app.schemas.row import ReportRow

FINISHED = ("Đã hoàn thành", "Hủy")
RISK_WORDS = re.compile(r"blocker|lùi lịch|chậm|delay|hoãn|vướng|vỡ sla", re.I)


def is_active(row: ReportRow) -> bool:
    return row.trang_thai not in FINISHED


def _week_text(row: ReportRow, prefix: str) -> list[str]:
    return [getattr(row, f"{prefix}_w{w}") for w in (1, 2, 3, 4)]


def progress_conflicts(rows: list[ReportRow], ref_date: date) -> list[WarningIssue]:
    out = []
    for r in rows:
        if r.tien_do != "Đúng tiến độ" or not is_active(r):
            continue
        reasons = []
        if any(t.strip() for t in _week_text(r, "van_de")):  # wiki "# *Blockers:*" / Risk Notes land here
            reasons.append("có Blockers/rủi ro ghi nhận")
        if any(RISK_WORDS.search(t) for t in _week_text(r, "hoan_thanh") + _week_text(r, "ke_hoach")):
            reasons.append("nội dung tuần nhắc chậm/lùi lịch")
        if r.ket_thuc and r.ket_thuc < ref_date:
            reasons.append(f"đã quá hạn {r.ket_thuc:%d/%m/%Y}")
        if reasons:
            out.append(WarningIssue(
                code="W_PROGRESS_CONFLICT", key=r.issue_key or r.ma_da, field="tien_do",
                message=f"{r.ma_da}: 'Đúng tiến độ' nhưng " + "; ".join(reasons),
            ))
    return out


def unmapped_values(rows: list[ReportRow]) -> list[WarningIssue]:
    out = []
    for r in rows:
        for field, value, allowed in (("trang_thai", r.trang_thai, STATUS_VALUES), ("tien_do", r.tien_do, PROGRESS_VALUES)):
            empty_ok = field == "trang_thai" or not is_active(r)
            if (value and value not in allowed) or (not value and not empty_ok):
                out.append(WarningIssue(
                    code="W_UNMAPPED_VALUE", key=r.issue_key or r.ma_da, field=field,
                    message=f"{r.ma_da}: giá trị '{value}' chưa có trong bảng quy đổi" if value
                    else f"{r.ma_da}: thiếu giá trị {field}",
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

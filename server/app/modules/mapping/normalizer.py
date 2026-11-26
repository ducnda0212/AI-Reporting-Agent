"""Value normalization (sheet 3_Quy_doi_gia_tri): status, progress, AI lifecycle phase, dates."""
import re
from datetime import date

STATUS_VALUES = ("Chưa thực hiện", "Đang thực hiện", "Đã hoàn thành", "Tạm dừng", "Hủy")
PROGRESS_VALUES = ("Đúng tiến độ", "Chậm tiến độ", "Tạm dừng", "Có rủi ro")
# Same 12 steps as client/src/data/constants.ts STAGES
PHASE_NAMES = (
    "Xác định bài toán AI & Ý tưởng sản phẩm", "Xác định yêu cầu nghiệp vụ chi tiết (PRD)",
    "Khảo sát & chuẩn bị dữ liệu", "Thiết kế giải pháp", "Huấn luyện mô hình", "Đánh giá mô hình",
    "Phát triển phần mềm", "Tích hợp Software & Event Logging", "Kiểm thử & UAT",
    "Đánh giá An ninh Bảo mật (ANBM)", "Phê duyệt & Triển khai Go-Live",
    "Đánh giá sau Go-Live (Post-Launch Report)",
)

# Jira values not listed here (Monitoring, Blocked, typos...) are kept raw and warned about.
# Display-case keys: these are the defaults seeded into MappingConfig; lookup goes through _key().
DEFAULT_STATUS_MAP = {
    "To Do": "Chưa thực hiện", "Open": "Chưa thực hiện", "Backlog": "Chưa thực hiện",
    "In Progress": "Đang thực hiện", "Reopened": "Đang thực hiện",
    "Done": "Đã hoàn thành", "Closed": "Đã hoàn thành", "Resolved": "Đã hoàn thành",
    "Hold": "Tạm dừng", "On Hold": "Tạm dừng", "Paused": "Tạm dừng", "Waiting": "Tạm dừng", "Pending": "Tạm dừng",
    "Cancelled": "Hủy", "Canceled": "Hủy", "Won't Do": "Hủy",
}
DEFAULT_PROGRESS_MAP = {
    "On Track": "Đúng tiến độ", "Đúng tiến độ": "Đúng tiến độ",
    "Off Track": "Chậm tiến độ", "Delayed": "Chậm tiến độ", "Trễ hạn": "Chậm tiến độ", "Chậm tiến độ": "Chậm tiến độ",
    "At Risk": "Có rủi ro", "Rủi ro": "Có rủi ro", "Có rủi ro": "Có rủi ro",
    "On Hold": "Tạm dừng", "Tạm dừng": "Tạm dừng",
}
DEFAULT_PHASE_MAP = {str(n): f"{n}.{name}" for n, name in enumerate(PHASE_NAMES, 1)}


def _key(val: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[-_]", " ", val)).strip().casefold()


def keyed(table: dict[str, str]) -> dict[str, str]:
    return {_key(k): v for k, v in table.items()}


_STATUS_MAP, _PROGRESS_MAP, _PHASE_MAP = keyed(DEFAULT_STATUS_MAP), keyed(DEFAULT_PROGRESS_MAP), DEFAULT_PHASE_MAP


def _lookup(table: dict[str, str], val: str | None) -> str:
    if not val or not val.strip():
        return ""
    return table.get(_key(val), val.strip())


# `table` (optional) is an already-`keyed()` custom map from a MappingConfig; None = Phase-1 defaults.
def normalize_status(val: str | None, table: dict[str, str] | None = None) -> str:
    return _lookup(table or _STATUS_MAP, val)


def normalize_progress(val: str | None, table: dict[str, str] | None = None) -> str:
    return _lookup(table or _PROGRESS_MAP, val)


def phase_number(val: str | None, bucket: dict[str, int] | None = None) -> int:
    """AI lifecycle step 1..12 of a raw Jira phase (explicit `bucket` entry first, else its leading number); 0 = unknown."""
    if not val or not val.strip() or val.strip().upper() == "TBD":
        return 0
    if bucket and val.strip() in bucket:
        return bucket[val.strip()]
    m = re.match(r"\s*(?:phase|bước|buoc|step)?\s*(\d{1,2})\b", val, re.I)
    return int(m.group(1)) if m and 1 <= int(m.group(1)) <= len(PHASE_NAMES) else 0


def normalize_phase(val: str | None, table: dict[str, str] | None = None, bucket: dict[str, int] | None = None) -> str:
    if not val or not val.strip() or val.strip().upper() == "TBD":
        return ""
    if n := phase_number(val, bucket):
        return (table or _PHASE_MAP).get(str(n), val.strip())
    return val.strip()


_MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}


def _mk(y: int, m: int, d: int) -> date | None:
    try:
        return date(y + 2000 if y < 100 else y, m, d)
    except ValueError:
        return None


def parse_jira_date(val: str | None) -> date | None:
    """Locale-proof parse of Jira dates; the time part is ignored."""
    if not val:
        return None
    s = val.strip()
    if m := re.match(r"(\d{4})-(\d{2})-(\d{2})", s):
        return _mk(*map(int, m.groups()))
    if m := re.match(r"(\d{1,2})/([A-Za-z]{3})/(\d{2,4})", s):  # 31/Dec/26 12:00 AM
        mon = _MONTHS.get(m.group(2).lower())
        return _mk(int(m.group(3)), mon, int(m.group(1))) if mon else None
    if m := re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s):
        a, b, y = map(int, m.groups())
        # shortcut: ambiguous a/b/Y is read as M/D/Y (Jira export format); upgrade if exports change
        return _mk(y, a, b) or _mk(y, b, a)
    return None

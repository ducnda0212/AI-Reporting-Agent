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
_STATUS_MAP = {
    "to do": "Chưa thực hiện", "open": "Chưa thực hiện", "backlog": "Chưa thực hiện",
    "in progress": "Đang thực hiện", "reopened": "Đang thực hiện",
    "done": "Đã hoàn thành", "closed": "Đã hoàn thành", "resolved": "Đã hoàn thành",
    "hold": "Tạm dừng", "on hold": "Tạm dừng", "paused": "Tạm dừng", "waiting": "Tạm dừng", "pending": "Tạm dừng",
    "cancelled": "Hủy", "canceled": "Hủy", "won't do": "Hủy",
}
_PROGRESS_MAP = {
    "on track": "Đúng tiến độ", "đúng tiến độ": "Đúng tiến độ",
    "off track": "Chậm tiến độ", "delayed": "Chậm tiến độ", "trễ hạn": "Chậm tiến độ", "chậm tiến độ": "Chậm tiến độ",
    "at risk": "Có rủi ro", "rủi ro": "Có rủi ro", "có rủi ro": "Có rủi ro",
    "on hold": "Tạm dừng", "tạm dừng": "Tạm dừng",
}


def _key(val: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[-_]", " ", val)).strip().casefold()


def _lookup(table: dict[str, str], val: str | None) -> str:
    if not val or not val.strip():
        return ""
    return table.get(_key(val), val.strip())


def normalize_status(val: str | None) -> str:
    return _lookup(_STATUS_MAP, val)


def normalize_progress(val: str | None) -> str:
    return _lookup(_PROGRESS_MAP, val)


def normalize_phase(val: str | None) -> str:
    if not val or not val.strip() or val.strip().upper() == "TBD":
        return ""
    m = re.match(r"\s*(?:phase|bước|buoc|step)?\s*(\d{1,2})\b", val, re.I)
    if m and 1 <= int(m.group(1)) <= len(PHASE_NAMES):
        n = int(m.group(1))
        return f"{n}.{PHASE_NAMES[n - 1]}"
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

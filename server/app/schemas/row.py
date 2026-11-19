from datetime import date

from pydantic import Field

from server.app.schemas.common import ApiModel

# Template column letter -> ReportRow field (A..AW, sheet "Mẫu báo cáo"). X is the untitled spacer.
COLUMN_FIELDS: dict[str, str] = {
    "A": "mang_viec", "B": "ma_da", "C": "cong_viec", "D": "muc_tieu", "E": "kpi", "F": "pic",
    "G": "bat_dau", "H": "ket_thuc", "I": "trang_thai", "J": "tien_do", "K": "milestone",
    "L": "ai_lifecycle_phase", "M": "output", "N": "note", "O": "gdk_qltt", "P": "phong",
    "Q": "tp", "R": "business_owner", "S": "product_owner", "T": "ai_engineer",
    "U": "ai_researcher", "V": "data_mlops", "W": "software_engineer", "X": "",
    "Y": "cai_tien", "Z": "priority", "AA": "trang_thai_1", "AB": "gia_tri",
    "AC": "muc_do_rui_ro", "AD": "action", "AE": "next_step", "AF": "loai_du_an",
    "AG": "link_confluence", "AH": "domain", "AI": "market", "AJ": "ai_lifecycle",
    "AK": "uoc_tinh_gia_tri",
    "AL": "hoan_thanh_w1", "AM": "ke_hoach_w1", "AN": "van_de_w1",
    "AO": "hoan_thanh_w2", "AP": "ke_hoach_w2", "AQ": "van_de_w2",
    "AR": "hoan_thanh_w3", "AS": "ke_hoach_w3", "AT": "van_de_w3",
    "AU": "hoan_thanh_w4", "AV": "ke_hoach_w4", "AW": "van_de_w4",
}


class SubtaskAudit(ApiModel):
    key: str
    summary: str = ""
    status: str = ""
    assignee: str = ""


def _s() -> str:
    return ""


class ReportRow(ApiModel):
    stt: int
    issue_key: str = ""
    # A..W
    mang_viec: str = ""
    ma_da: str = ""
    cong_viec: str = ""
    muc_tieu: str = ""
    kpi: str = ""
    pic: str = ""
    bat_dau: date | None = None
    ket_thuc: date | None = None
    trang_thai: str = ""
    tien_do: str = ""
    milestone: str = ""
    ai_lifecycle_phase: str = ""
    output: str = ""
    note: str = ""
    gdk_qltt: str = ""
    phong: str = ""
    tp: str = ""
    business_owner: str = ""
    product_owner: str = ""
    ai_engineer: str = ""
    ai_researcher: str = ""
    data_mlops: str = ""
    software_engineer: str = ""
    # Y..AK
    cai_tien: str = ""
    priority: str = ""
    trang_thai_1: str = ""
    gia_tri: str = ""
    muc_do_rui_ro: str = ""
    action: str = ""
    next_step: str = ""
    loai_du_an: str = ""
    link_confluence: str = ""
    domain: str = ""
    market: str = ""
    ai_lifecycle: str = ""
    uoc_tinh_gia_tri: str = ""
    # AL..AW (4 weeks x done/plan/issues)
    hoan_thanh_w1: str = ""
    ke_hoach_w1: str = ""
    van_de_w1: str = ""
    hoan_thanh_w2: str = ""
    ke_hoach_w2: str = ""
    van_de_w2: str = ""
    hoan_thanh_w3: str = ""
    ke_hoach_w3: str = ""
    van_de_w3: str = ""
    hoan_thanh_w4: str = ""
    ke_hoach_w4: str = ""
    van_de_w4: str = ""
    # audit / state
    subtasks: list[SubtaskAudit] = Field(default_factory=list)
    overrides: dict[str, str] = Field(default_factory=dict)
    needs_review: bool = False

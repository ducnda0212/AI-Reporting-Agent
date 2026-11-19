"""Default mapping `map_default_pmo_49col`: mirrors the Phase-1 hardcoded rules, so behavior is unchanged."""
import json

from sqlalchemy.orm import Session

from server.app.models.mapping import MappingConfig
from server.app.modules.mapping.normalizer import DEFAULT_PHASE_MAP, DEFAULT_PROGRESS_MAP, DEFAULT_STATUS_MAP
from server.app.schemas.row import COLUMN_FIELDS

DEFAULT_MAPPING_ID = "map_default_pmo_49col"

# field_id -> (header, source_type, source_field, fallbacks). jira = copied from the listed columns
# (first non-empty wins) and editable; derived = computed by code; constant; manual = left for the user/AI.
_J = "jira"
_SOURCES: dict[str, tuple] = {
    "mang_viec": ("Mảng việc", "derived", "Master catalog / mã DA", []),
    "ma_da": ("Mã DA", "derived", "Summary", []),
    "cong_viec": ("Công việc", "derived", "Summary", []),
    "muc_tieu": ("Mục tiêu", "derived", "Description / Custom field (Goals)", []),
    "kpi": ("KPI", _J, "Custom field (KPI/Outcome)", []),
    "pic": ("PIC", _J, "Assignee", ["Custom field (PO)", "Custom field (Tech lead)"]),
    "bat_dau": ("Ngày bắt đầu", _J, "Custom field (Start date)", []),
    "ket_thuc": ("Ngày kết thúc", _J, "Due date", []),
    "trang_thai": ("Trạng thái", _J, "Status", ["Status category"]),
    "tien_do": ("Tiến độ", _J, "Custom field (Progress)", []),
    "milestone": ("Milestone", "derived", "Description", []),
    "ai_lifecycle_phase": ("Bước trong AI Lifecycle", _J, "Custom field (AI Lifecycle)", ["Custom field (Phase)"]),
    "gdk_qltt": ("GĐK QLTT", _J, "Custom field (Board of Management)", []),
    "phong": ("Phòng chịu trách nhiệm", _J, "Custom field (Department)", []),
    "business_owner": ("Business Owner", _J, "Custom field (Business Owner)", []),
    "product_owner": ("Product Owner", _J, "Custom field (PO)", ["Custom field (Product manager)"]),
    "software_engineer": ("BE/FE/DevOps (Software Engineer)", "derived", "Custom field (Dev-BE/Dev-FE/Developer)", []),
    "priority": ("Priority (Final)", _J, "Priority", ["Custom field (Priority)"]),
    "trang_thai_1": ("TRẠNG THÁI 1", "derived", "Trạng thái + Tiến độ", []),
    "loai_du_an": ("Loại dự án", "constant", "KHHĐ 2026", []),
    "link_confluence": ("Link Confluence", "derived", "Custom field (PRD)", []),
    "market": ("Market", "constant", "VN", []),
    "ai_lifecycle": ("AI Lifecycle", "derived", "Bước trong AI Lifecycle", []),
}
_REQUIRED = {"pic", "bat_dau", "ket_thuc"}
_WEEK_NAMES = {"hoan_thanh": "Công việc đã hoàn thành", "ke_hoach": "Kế hoạch tuần sau", "van_de": "Vấn đề, rủi ro và đề xuất"}
_TEMPLATE_NAMES = {"output": "Output", "note": "Note", "tp": "TP", "ai_engineer": "AI Engineer", "ai_researcher": "AI researcher",
                   "data_mlops": "Data/MLOps Engineer", "cai_tien": "Cải tiến/Xây mới", "gia_tri": "Giá trị mang lại",
                   "muc_do_rui_ro": "Mức độ rủi ro", "action": "Action", "next_step": "Đề xuất Next Step", "domain": "Domain",
                   "uoc_tinh_gia_tri": "Ước tính chi tiết giá trị"}


def default_columns() -> list[dict]:
    cols = []
    for letter, field in COLUMN_FIELDS.items():
        if field in _SOURCES:
            name, stype, src, fb = _SOURCES[field]
        elif field[-3:-1] == "_w":  # hoan_thanh_w1 ...
            name, stype, src, fb = f"{_WEEK_NAMES[field[:-3]]} W{field[-1]}", "derived", "Progress Report / Risk Notes", []
        else:  # manual columns; X is the untitled spacer
            name, stype, src, fb = _TEMPLATE_NAMES.get(field, ""), "manual", "", []
        cols.append({"field_id": field or "spacer", "col_letter": letter, "name": name, "source_type": stype,
                     "source_field": src, "fallbacks": fb, "required": field in _REQUIRED})
    return cols


def default_value_mappings() -> dict:
    return {"status_map": dict(DEFAULT_STATUS_MAP), "progress_map": dict(DEFAULT_PROGRESS_MAP),
            "phase_map": dict(DEFAULT_PHASE_MAP)}


def seed_default_mapping(db: Session) -> MappingConfig:
    """Idempotent: create the default mapping on an empty table, otherwise return the existing one."""
    existing = db.get(MappingConfig, DEFAULT_MAPPING_ID)
    if existing is not None:
        return existing
    cfg = MappingConfig(
        id=DEFAULT_MAPPING_ID, name="Mẫu 49 cột chuẩn PMO", description="77 quy tắc mapping chuẩn của PMO (Chặng 1)",
        is_default=True, columns_json=json.dumps(default_columns(), ensure_ascii=False),
        value_mappings_json=json.dumps(default_value_mappings(), ensure_ascii=False),
    )
    db.add(cfg)
    db.commit()
    return cfg

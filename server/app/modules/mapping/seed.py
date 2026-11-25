"""Default mapping `map_default_pmo_49col`: mirrors the Phase-1 hardcoded rules, so behavior is unchanged."""
import json

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from server.app.models.mapping import MappingConfig
from server.app.modules.mapping.normalizer import DEFAULT_PHASE_MAP, DEFAULT_PROGRESS_MAP, DEFAULT_STATUS_MAP
from server.app.schemas.row import COLUMN_FIELDS

DEFAULT_MAPPING_ID = "map_default_pmo_49col"

# field_id -> (header, source_type, source_field, fallbacks). jira = copied from the listed columns
# (first non-empty wins) and editable; derived = computed by code (a user-picked Jira column replaces it);
# constant; manual = left for the user/AI (a user-picked Jira column fills it).
_J = "jira"
_SOURCES: dict[str, tuple] = {
    "mang": ("Mảng việc", "derived", "Master catalog / mã DA", []),
    "ma": ("Mã DA", "derived", "Summary", []),
    "viec": ("Công việc", "derived", "Summary", []),
    "muctieu": ("Mục tiêu", "derived", "Description / Custom field (Goals)", []),
    "kpi": ("KPI", _J, "Custom field (KPI/Outcome)", []),
    "pic": ("PIC", _J, "Assignee", ["Custom field (PO)", "Custom field (Tech lead)"]),
    "start": ("Ngày bắt đầu", _J, "Custom field (Start date)", []),
    "end": ("Ngày kết thúc", _J, "Due date", []),
    "tt": ("Trạng thái", _J, "Status", ["Status category"]),
    "td": ("Tiến độ", _J, "Custom field (Progress)", []),
    "milestone": ("Milestone", "derived", "Description", []),
    "buocso": ("Bước trong AI Lifecycle", _J, "Custom field (AI Lifecycle)", ["Custom field (Phase)"]),
    "gdk": ("GĐK QLTT", _J, "Custom field (Board of Management)", ["Custom field (Team Name)"]),
    "phong": ("Phòng chịu trách nhiệm", _J, "Custom field (Department)", []),
    "bo": ("Business Owner", _J, "Custom field (Business Owner)", []),
    "po": ("Product Owner", _J, "Custom field (PO)", ["Custom field (Product manager)"]),
    "swe": ("BE/FE/DevOps (Software Engineer)", "derived", "Custom field (Dev-BE/Dev-FE/Developer)", []),
    "prio": ("Priority (Final)", _J, "Priority", ["Custom field (Priority)"]),
    "tt1": ("TRẠNG THÁI 1", "derived", "Trạng thái + Tiến độ + Due date", []),
    "loai": ("Loại dự án", "constant", "KHHĐ 2026", []),
    "link": ("Link Confluence", "derived", "Custom field (PRD)", []),
    "market": ("Market", "constant", "VN", []),
    "buoc": ("AI Lifecycle", _J, "Custom field (AI Lifecycle)", ["Custom field (Phase)"]),
}
_REQUIRED = {"pic", "start", "end"}
_WEEK_NAMES = {"ht": "Công việc đã hoàn thành", "kh": "Kế hoạch tuần sau", "vd": "Vấn đề, rủi ro và đề xuất"}
_TEMPLATE_NAMES = {"output": "Output", "note": "Note", "tp": "TP", "aieng": "AI Engineer", "airs": "AI researcher",
                   "mlops": "Data/MLOps Engineer", "caitien": "Cải tiến/Xây mới", "giatri": "Giá trị mang lại",
                   "rui": "Mức độ rủi ro", "action": "Action", "nextstep": "Đề xuất Next Step", "domain": "Domain",
                   "uoctinh": "Ước tính chi tiết giá trị"}


def _week(field: str) -> tuple[str, str] | None:
    """w1ht -> ("ht", "1"); ht/kh/vd = week 3; None for non-week fields."""
    if field in _WEEK_NAMES:
        return field, "3"
    if len(field) == 4 and field[0] == "w" and field[1] in "124" and field[2:] in _WEEK_NAMES:
        return field[2:], field[1]
    return None


def default_columns() -> list[dict]:
    cols = []
    for letter, field in COLUMN_FIELDS.items():
        if field in _SOURCES:
            name, stype, src, fb = _SOURCES[field]
        elif wk := _week(field):
            name, stype, src, fb = f"{_WEEK_NAMES[wk[0]]} W{wk[1]}", "derived", "Progress Report / Risk Notes", []
        else:  # manual columns; X is the untitled spacer
            name, stype, src, fb = _TEMPLATE_NAMES.get(field, ""), "manual", "", []
        cols.append({"field_id": field, "col_letter": letter, "name": name, "source_type": stype,
                     "source_field": src, "fallbacks": fb, "required": field in _REQUIRED})
    return cols


def default_value_mappings() -> dict:
    return {"status_map": dict(DEFAULT_STATUS_MAP), "progress_map": dict(DEFAULT_PROGRESS_MAP),
            "phase_map": dict(DEFAULT_PHASE_MAP), "phase_bucket": {}}


# Field ids before the client-contract rename (stored mappings may still carry them).
_LEGACY = {
    "mang_viec": "mang", "ma_da": "ma", "cong_viec": "viec", "muc_tieu": "muctieu", "bat_dau": "start", "ket_thuc": "end",
    "trang_thai": "tt", "tien_do": "td", "ai_lifecycle_phase": "buocso", "gdk_qltt": "gdk", "business_owner": "bo",
    "product_owner": "po", "ai_engineer": "aieng", "ai_researcher": "airs", "data_mlops": "mlops",
    "software_engineer": "swe", "cai_tien": "caitien", "priority": "prio", "trang_thai_1": "tt1", "gia_tri": "giatri",
    "muc_do_rui_ro": "rui", "next_step": "nextstep", "loai_du_an": "loai", "link_confluence": "link",
    "ai_lifecycle": "buoc", "uoc_tinh_gia_tri": "uoctinh", "spacer": "x",
    **{f"{k}_w{w}": (f"w{w}{s}" if w != 3 else s)
       for k, s in (("hoan_thanh", "ht"), ("ke_hoach", "kh"), ("van_de", "vd")) for w in (1, 2, 3, 4)},
}


def migrate_schema(engine: Engine) -> None:
    """create_all never alters an existing table: add the columns introduced after a dev DB was created."""
    cols = {c["name"] for c in inspect(engine).get_columns("ingest_sessions")}
    if "baseline_session_id" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE ingest_sessions ADD COLUMN baseline_session_id VARCHAR"))


def _upgrade_stored(db: Session) -> None:
    """Rewrite mappings saved under the old field ids; the stale default is regenerated."""
    for cfg in db.query(MappingConfig):
        cols = json.loads(cfg.columns_json)
        if not any(c["field_id"] in _LEGACY for c in cols):
            continue
        if cfg.id == DEFAULT_MAPPING_ID:
            cfg.columns_json = json.dumps(default_columns(), ensure_ascii=False)
        else:
            cfg.columns_json = json.dumps([{**c, "field_id": _LEGACY.get(c["field_id"], c["field_id"])} for c in cols],
                                          ensure_ascii=False)
        cfg.value_mappings_json = json.dumps({"phase_bucket": {}, **json.loads(cfg.value_mappings_json)}, ensure_ascii=False)
    db.commit()


def seed_default_mapping(db: Session) -> MappingConfig:
    """Idempotent: create the default mapping on an empty table, otherwise return the existing one."""
    _upgrade_stored(db)
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

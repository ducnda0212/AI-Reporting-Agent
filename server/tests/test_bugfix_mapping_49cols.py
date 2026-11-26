from fastapi.testclient import TestClient

from server.app.main import app
from server.app.modules.mapping.resolved import MAPPABLE
from server.app.schemas.row import COLUMN_FIELDS
from server.tests.helpers import golden_csv

client = TestClient(app)


def _upload():
    r = client.post(
        "/api/v1/ingest/upload", files={"file": ("g.csv", golden_csv(), "text/csv")},
        data={"cycle_id": "2026_11_w3", "force_reload": "true"},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_default_mapping_is_he_thong_cannot_delete_even_when_not_default_and_all_49_mappable():
    assert MAPPABLE == frozenset(COLUMN_FIELDS.values())
    maps = client.get("/api/v1/mappings").json()
    sys_cfg = next(m for m in maps if m["id"] == "map_default_pmo_49col")
    assert sys_cfg["name"] == "Hệ thống"
    cols = {c["field_id"]: c for c in sys_cfg["columns"]}
    assert cols["loai"]["source_field"] == "" and cols["market"]["source_field"] == ""
    assert cols["muctieu"]["source_field"] == "Description" and cols["mang"]["source_field"] == ""

    cloned = client.post("/api/v1/mappings/map_default_pmo_49col/clone", json={"new_name": "Custom"}).json()
    client.post(f"/api/v1/mappings/{cloned['id']}/set-default")
    assert client.delete("/api/v1/mappings/map_default_pmo_49col").status_code == 400  # system row stays
    assert client.delete(f"/api/v1/mappings/{cloned['id']}").status_code == 400  # current default stays
    client.post("/api/v1/mappings/map_default_pmo_49col/set-default")
    assert client.delete(f"/api/v1/mappings/{cloned['id']}").status_code == 200


def test_recalculate_49_cols_clear_and_no_hardcoded_loai_market():
    up = _upload()
    ic = next(r for r in up["rows"] if r["ma"] == "I.C.1.2")
    assert ic["loai"] == "" and ic["market"] == ""
    assert ic["viec"] and not ic["viec"].startswith("I.C.1.2")

    def recalc(src):
        r = client.post("/api/v1/mapping/recalculate", json={"session_id": up["session_id"], "src_overrides": src})
        assert r.status_code == 200, r.text
        return next(x for x in r.json()["rows"] if x["ma"] == "I.C.1.2")

    smart = recalc({"viec": "Summary"})  # the default source keeps the smart parser (code stripped)
    assert smart["viec"] == ic["viec"]
    ic2 = recalc({"tt1": "Priority", "viec": "", "caitien": "Project type"})
    assert ic2["tt1"] == "Medium" and ic2["viec"] == "" and ic2["caitien"] == "software"


def test_old_stored_default_is_renamed_and_loses_constants():
    import json

    from server.app.core.database import SessionLocal
    from server.app.models.mapping import MappingConfig
    from server.app.modules.mapping.seed import seed_default_mapping

    with SessionLocal() as db:
        cfg = db.get(MappingConfig, "map_default_pmo_49col")
        cols = json.loads(cfg.columns_json)
        next(c for c in cols if c["field_id"] == "loai").update(source_type="constant", source_field="KHHĐ 2026")
        cfg.name, cfg.columns_json = "Mẫu 49 cột chuẩn PMO", json.dumps(cols, ensure_ascii=False)
        db.commit()
        cfg = seed_default_mapping(db)
        loai = next(c for c in json.loads(cfg.columns_json) if c["field_id"] == "loai")
        assert cfg.name == "Hệ thống" and loai["source_type"] == "manual" and loai["source_field"] == ""

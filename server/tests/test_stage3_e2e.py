import io

import openpyxl
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_stage3_e2e_w4_lock_export_preserve_weeks_and_december_rollover(monkeypatch):
    monkeypatch.setattr(settings, "DEFAULT_CYCLE_ID", "2026_11_w4")
    with open(f"{settings.FIXTURES_DIR}/golden_dataset.csv", "rb") as f:
        up = client.post("/api/v1/ingest/upload", files={"file": ("g.csv", f, "text/csv")},
                         data={"cycle_id": "2026_11_w4", "force_reload": "true"}).json()
    sid = up["session_id"]
    snap = {f"{r['ma']}|ma": r["ma"] for r in up["rows"]}
    snap["I.C.1.2|w4ht"] = "W4 Progress Real"

    v_nov = client.post("/api/v1/reports/lock", json={
        "session_id": sid, "cycle_id": "2026_11_w4", "wk": "w4", "by": "Khuê", "file_name": "g.csv",
        "snap": snap, "raw_notes": {"I.C.1.2": "Raw W4 Note"}, "fmt": {"I.C.1.2|w4ht": {"fill": "#DCFCE7"}},
        "wrap": {"I.C.1.2|w4ht": True}, "hidden": {"x": True, "mang": True},
    }).json()

    exp = client.post("/api/v1/reports/export-excel", json={
        "version_id": v_nov["id"], "ex_cols": "vis", "only_current_week": True, "append_override_note": False})
    assert exp.status_code == 200
    ws = openpyxl.load_workbook(io.BytesIO(exp.content))["Mẫu báo cáo"]
    r_ic = next(r for r in range(2, 75) if ws.cell(r, 2).value == "I.C.1.2")
    assert ws.cell(r_ic, 47).value == "W4 Progress Real"  # AU = week 4 block
    assert ws.cell(r_ic, 14).value == "Raw W4 Note"
    assert ws["AN5"].value == "Phụ thuộc lịch"  # other week blocks untouched by only_current_week=True
    assert ws.cell(r_ic, 47).fill.fgColor.rgb.endswith("DCFCE7")
    assert ws.column_dimensions["A"].hidden is True and ws.column_dimensions["B"].hidden is not True

    # December W1 does not collide with November's w4 and is listed on its own
    monkeypatch.setattr(settings, "DEFAULT_CYCLE_ID", "2026_12_w1")
    v_dec = client.post("/api/v1/reports/lock", json={
        "session_id": sid, "cycle_id": "2026_12_w1", "wk": "w1", "by": "Khuê", "file_name": "g.csv",
        "snap": {"I.C.1.2|ma": "I.C.1.2", "I.C.1.2|w1ht": "Dec W1"},
    }).json()
    assert v_dec["v"] == 1 and v_dec["id"] == "ver_2026_12_w1_v1"
    dec = client.get("/api/v1/reports/versions").json()
    assert [v["id"] for v in dec] == [v_dec["id"]]
    nov = client.get("/api/v1/reports/versions", params={"cycle_month": "2026_11"}).json()
    assert v_nov["id"] in [v["id"] for v in nov]

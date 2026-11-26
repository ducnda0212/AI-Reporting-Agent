import io

import openpyxl
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)
XLSX = "spreadsheetml"


def _upload():
    with open(f"{settings.FIXTURES_DIR}/golden_dataset.csv", "rb") as f:
        return client.post("/api/v1/ingest/upload", files={"file": ("g.csv", f, "text/csv")},
                           data={"cycle_id": "2026_11_w3", "force_reload": "true"}).json()["session_id"]


def test_lock_versions_export_and_reexport_roundtrip():
    sid = _upload()
    lk = client.post("/api/v1/reports/lock", json={
        "session_id": sid, "cycle_id": "2026_11_w3", "wk": "w3", "by": "Khuê", "note": "v1", "file_name": "g.csv",
        "snap": {"I.C.1.2|ma": "I.C.1.2", "I.C.1.2|ht": "Done W3 Export"}, "raw_notes": {},
        "fmt": {"I.C.1.2|ht": {"b": True}}, "wrap": {}, "hidden": {"x": True},
    })
    assert lk.status_code == 200
    vid = lk.json()["id"]

    exp = client.post("/api/v1/reports/export-excel", json={
        "version_id": vid, "file_name": "PMO_Báo cáo.xlsx", "ex_cols": "vis", "only_current_week": True, "append_override_note": True})
    assert exp.status_code == 200 and XLSX in exp.headers["content-type"]
    assert "filename*=UTF-8''" in exp.headers["content-disposition"]
    assert exp.headers["x-exported-filename"] == "PMO_B%C3%A1o%20c%C3%A1o.xlsx"
    ws = openpyxl.load_workbook(io.BytesIO(exp.content))["Mẫu báo cáo"]
    assert any(ws.cell(r, 44).value == "Done W3 Export" for r in range(2, 70))

    re_exp = client.get("/api/v1/reports/export-excel", params={"version_id": vid})
    assert re_exp.status_code == 200 and re_exp.content == exp.content

    vers = client.get("/api/v1/reports/versions").json()
    assert any(v["id"] == vid and v["exported"] == "PMO_Báo cáo.xlsx" for v in vers)
    assert client.get("/api/v1/reports/versions", params={"cycle_month": "2099_01"}).json() == []


def test_export_logs_to_existing_draft():
    sid = _upload()
    client.put(f"/api/v1/sessions/{sid}/draft", json={"session_id": sid, "cycle_id": "2026_11_w3", "rows": [], "log_seq": 4})
    vid = client.post("/api/v1/reports/lock", json={
        "session_id": sid, "cycle_id": "2026_11_w3", "wk": "w3", "by": "Khuê", "snap": {"I.C.1.2|ma": "I.C.1.2"}}).json()["id"]
    assert client.post("/api/v1/reports/export-excel", json={"version_id": vid}).status_code == 200
    d = client.get(f"/api/v1/sessions/{sid}/draft").json()
    assert d["audit_logs"][-1]["a"] == "Xuất báo cáo" and d["audit_logs"][-1]["seq"] == 5 and d["log_seq"] == 5


def test_reporting_errors():
    sid = _upload()
    base = {"session_id": sid, "cycle_id": "2026_11_w3", "wk": "w3", "by": "Khuê"}
    assert client.post("/api/v1/reports/lock", json={**base, "session_id": "nope"}).json()["detail"]["code"] == "E_SESSION_NOT_FOUND"
    r = client.post("/api/v1/reports/lock", json={**base, "by": " "})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "E_LOCK_BY_REQUIRED"
    assert client.post("/api/v1/reports/lock", json={**base, "cycle_id": "x"}).json()["detail"]["code"] == "E_CYCLE_INVALID"
    assert client.post("/api/v1/reports/export-excel", json={"version_id": "nope"}).status_code == 404
    assert client.get("/api/v1/reports/export-excel", params={"version_id": "nope"}).json()["detail"]["code"] == "E_VERSION_NOT_FOUND"

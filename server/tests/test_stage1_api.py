import io

import openpyxl
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.helpers import golden_csv

client = TestClient(app)
CYCLE = "2026_11_w3"


def _upload(content: bytes, name="golden.csv", cycle=CYCLE, **data):
    return client.post("/api/v1/ingest/upload", files={"file": (name, content, "application/octet-stream")},
                       data={"cycle_id": cycle, "force_reload": "true", **data})


def test_demo_endpoint_removed():
    assert client.post("/api/v1/ingest/demo", json={"cycle_id": CYCLE}).status_code in (404, 405)


def test_upload_history_reopen_cycles_and_recalculate_preview_keeps_baseline():
    cycle = "2026_07_w3"
    first = _upload(golden_csv(), cycle=cycle).json()
    changed = golden_csv().decode("utf-8-sig").replace("I.A.4.3 Tối ưu định tuyến", "I.A.4.3 Tối ưu định tuyến (v2)", 1)
    res = _upload(changed.encode(), cycle=cycle)
    assert res.status_code == 200
    body = res.json()
    assert body["file_name"] == "golden.csv" and "Summary" in body["file_cols"]
    assert body["groups"] and {"k", "name"} == set(body["groups"][0])
    assert body["applied_mapping"]["id"] == "map_default_pmo_49col" and body["applied_mapping"]["total_cols"] == 49
    assert 0 < body["applied_mapping"]["matched_cols"] <= 49
    assert body["file_stats"]["dup_groups"] > 0 and body["file_stats"]["used_cols"] > 0
    assert body["diff_summary"]["has_previous_session"] and body["diff_summary"]["modified_count"] == 1
    sid = body["session_id"]
    assert first["session_id"] != sid

    hist = client.get("/api/v1/ingest/history").json()
    assert hist[0]["session_id"] == sid and hist[0]["name"] == "golden.csv" and len(hist) <= 10
    reopen = client.get(f"/api/v1/sessions/{sid}")
    assert reopen.status_code == 200 and reopen.json()["rows"] == body["rows"]
    assert client.get("/api/v1/sessions/nope").status_code == 404

    cyc = client.get("/api/v1/cycles/active").json()
    assert cyc["current_wk"] == "w3" and cyc["today"] == "2026-11-22" and len(cyc["weeks"]) == 4
    assert [w["cur"] for w in cyc["weeks"]] == [False, False, True, False] and cyc["weeks"][3]["future"]

    # mapQuick preview: re-point `phong` at a populated file column; diff baseline must not become the session itself
    rec = client.post("/api/v1/mapping/recalculate", json={"session_id": sid, "src_overrides": {"phong": "Custom field (Tech lead)"}}).json()
    assert rec["diff_summary"]["has_previous_session"] and rec["diff_summary"]["modified_count"] >= body["diff_summary"]["modified_count"]  # still vs the first upload, not itself
    assert any(r["phong"] for r in rec["rows"]) and not any(r["phong"] for r in body["rows"])
    assert client.get("/api/v1/mappings/map_default_pmo_49col").json()["version"] == 1  # preview never saves
    bad = client.post("/api/v1/mapping/recalculate", json={"session_id": sid, "src_overrides": {"nope": "Summary"}})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "E_SRC_OVERRIDE_INVALID_FIELD"


def test_xlsx_upload_matches_csv_and_legacy_xls_is_rejected():
    import csv
    rows = list(csv.reader(io.StringIO(golden_csv().decode("utf-8-sig"))))
    wb = openpyxl.Workbook()
    for r in rows:
        wb.active.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    as_csv = _upload(golden_csv(), cycle="2026_06_w3").json()
    as_xlsx = _upload(buf.getvalue(), name="golden.xlsx", cycle="2026_05_w3")
    assert as_xlsx.status_code == 200
    assert [r["ma"] for r in as_xlsx.json()["rows"]] == [r["ma"] for r in as_csv["rows"]]
    old = _upload(b"x", name="old.xls", cycle="2026_04_w3")
    assert old.status_code == 422 and old.json()["detail"]["code"] == "E_FILE_UNSUPPORTED_FORMAT"
    corrupt = _upload(b"not a zip", name="bad.xlsx", cycle="2026_04_w3")
    assert corrupt.status_code == 422 and corrupt.json()["detail"]["code"] == "E_FILE_INVALID_SCHEMA"


def test_default_mapping_cannot_be_deleted_and_clone_is_independent():
    r = client.delete("/api/v1/mappings/map_default_pmo_49col")
    assert r.status_code == 400 and r.json()["detail"]["code"] == "E_CANNOT_DELETE_DEFAULT_MAPPING"
    clone = client.post("/api/v1/mappings/map_default_pmo_49col/clone", json={}).json()
    assert clone["is_default"] is False and clone["id"] != "map_default_pmo_49col"
    assert settings.FIXTURES_DIR

import pytest
from fastapi.testclient import TestClient

from server.app.core.config import settings
from server.app.main import app

client = TestClient(app)
GOLDEN = f"{settings.FIXTURES_DIR}/golden_dataset.csv"


def _upload(content: bytes, name="x.csv", cycle="2026_11_w3", force=False):
    return client.post(
        "/api/v1/ingest/upload",
        files={"file": (name, content, "text/csv")},
        data={"cycle_id": cycle, "force_reload": str(force).lower()},
    )


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_demo_ingest_endpoint():
    response = client.post("/api/v1/ingest/demo", json={"cycle_id": "2026_11_w3"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["rows"]) > 0
    assert "file_stats" in data


def test_upload_rejects_bad_input_cleanly():
    r = _upload(b"Summary,Other\nA,B\n", cycle="2026_10_w1")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "E_FILE_INVALID_SCHEMA"
    r = _upload(b"x", name="report.pdf", cycle="2026_10_w2")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "E_FILE_UNSUPPORTED_FORMAT"
    r = _upload(b"Summary,Issue key\nA,K-1\n", cycle="not a cycle!")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "E_CYCLE_INVALID"


def test_duplicate_upload_returns_cached_session_then_force_reload_reparses():
    content = open(GOLDEN, "rb").read()
    first = _upload(content, cycle="2026_11_w2").json()
    assert first["is_duplicate_file"] is False
    again = _upload(content, cycle="2026_11_w2").json()
    assert again["is_duplicate_file"] is True
    assert again["session_id"] == first["session_id"] and again["rows"] == first["rows"]
    dup_warn = [w for w in again["warnings"] if w["code"] == "W_DUPLICATE_FILE"]
    assert len(dup_warn) == 1 and "đã được nạp" in dup_warn[0]["message"]
    assert not any(w["code"] == "W_DUPLICATE_FILE" for w in first["warnings"])
    forced = _upload(content, cycle="2026_11_w2", force=True).json()
    assert forced["is_duplicate_file"] is False and forced["session_id"] != first["session_id"]
    assert forced["diff_summary"]["has_previous_session"] is True
    assert forced["diff_summary"]["modified_count"] == 0 and forced["diff_summary"]["added_projects"] == []


def test_second_file_in_cycle_reports_diff():
    base = open(GOLDEN, "rb").read().decode("utf-8-sig")
    _upload(base.encode(), cycle="2026_09_w3")
    changed = base.replace("I.A.4.3 Tối ưu định tuyến", "I.A.4.3 Tối ưu định tuyến (v2)", 1)
    assert changed != base
    r = _upload(changed.encode(), cycle="2026_09_w3").json()
    assert r["diff_summary"]["has_previous_session"] is True
    assert r["diff_summary"]["modified_count"] == 1

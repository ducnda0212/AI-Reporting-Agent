import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)
SAMPLE = Path(__file__).parent / "data" / "sample_jira_277_cols.csv"


@pytest.fixture(autouse=True)
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr("server.core.config.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("server.core.config.UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setattr("server.core.config.META_FILE", tmp_path / "uploads_meta.json")


def up():
    return client.post(
        "/api/import/upload?target_week=w3",
        files={"file": ("Jira_Sample.csv", SAMPLE.read_bytes(), "text/csv")},
    )


def test_real_sample_csv_e2e():
    t0 = time.perf_counter()
    res = up()
    elapsed = time.perf_counter() - t0
    print(f"upload+parse: {elapsed * 1000:.0f} ms")
    assert res.status_code == 200
    assert elapsed < 2
    data = res.json()
    stats = data["file_stats"]
    assert (stats["total_cols"], stats["total_issues"], stats["duplicate_groups"]) == (277, 2, 14)
    assert data["file_info"]["is_duplicate"] is False

    cols = data["columns"]
    prd = [c for c in cols if c["name"] == "Custom field (PRD)"]
    assert len(prd) == 3
    assert len({c["index"] for c in prd}) == 3
    assert any("Link: PRD" in v for c in prd for v in c["sample_values"])

    summary = next(c for c in cols if c["name"] == "Summary")
    assert any(v.startswith("I.A.5.1") for v in summary["sample_values"])

    # multi-line cell survived intact
    progress = next(c for c in cols if c["name"] == "Custom field (Progress Report)")
    assert any("||*Week*||" in v and "\n|{{2026-09-11}}|" in v for v in progress["sample_values"])

    # second upload -> duplicate, same id; history lists it; detail round trips
    second = up().json()
    assert second["file_info"]["is_duplicate"] is True
    fid = data["file_info"]["id"]
    assert second["file_info"]["id"] == fid
    hist = client.get("/api/import/history").json()
    assert [h["id"] for h in hist] == [fid]
    detail = client.get(f"/api/import/history/{fid}").json()
    assert len(detail["columns"]) == 277

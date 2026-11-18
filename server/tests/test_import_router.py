import json

import pytest
from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)
CSV = b"""Summary,Status,Assignee\n"I.A.1 Project 1",IN PROGRESS,User A\n"I.A.2 Project 2",DONE,User B"""


@pytest.fixture(autouse=True)
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr("server.core.config.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("server.core.config.UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setattr("server.core.config.META_FILE", tmp_path / "uploads_meta.json")
    return tmp_path


def up(content=CSV, name="test_jira.csv"):
    return client.post("/api/import/upload?target_week=w3", files={"file": (name, content, "text/csv")})


def test_api_upload_jira_csv():
    res = up()
    assert res.status_code == 200
    data = res.json()
    assert data["file_info"]["filename"] == "test_jira.csv"
    assert data["file_info"]["is_duplicate"] is False
    assert data["file_stats"]["total_cols"] == 3
    assert data["file_stats"]["total_issues"] == 2
    assert len(data["columns"]) == 3
    assert data["columns"][0]["name"] == "Summary"
    assert len(data["columns"][0]["sample_values"]) == 2
    assert len(data["issues_sample"]) == 2
    assert "_raw_by_index" not in data["issues_sample"][0]

    res2 = up()
    assert res2.status_code == 200
    assert res2.json()["file_info"]["is_duplicate"] is True
    assert res2.json()["file_info"]["id"] == data["file_info"]["id"]

    hist = client.get("/api/import/history")
    assert hist.status_code == 200
    assert len(hist.json()) == 1  # duplicate not stored twice


def test_oversize_rejected(monkeypatch, storage):
    monkeypatch.setattr("server.core.config.MAX_UPLOAD_BYTES", 10)
    assert up().status_code == 400
    assert not (storage / "uploads_meta.json").exists()


@pytest.mark.parametrize("content,name", [(b"", "a.csv"), (b"\xff\xfe\x00bad", "a.csv"), (CSV, "a.txt")])
def test_invalid_rejected_and_not_stored(content, name, storage):
    res = up(content, name)
    assert res.status_code == 400
    assert res.json()["detail"]
    assert client.get("/api/import/history").json() == []


def test_history_detail():
    fid = up().json()["file_info"]["id"]
    res = client.get(f"/api/import/history/{fid}")
    assert res.status_code == 200
    assert res.json()["file_info"]["is_duplicate"] is False
    assert res.json()["file_stats"]["total_issues"] == 2
    assert "_raw_by_index" not in json.dumps(res.json())
    assert client.get("/api/import/history/nope").status_code == 404

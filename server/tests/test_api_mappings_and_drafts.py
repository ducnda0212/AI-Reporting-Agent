from fastapi.testclient import TestClient

from app.main import app
from tests.helpers import golden_csv

client = TestClient(app)
DEFAULT = "map_default_pmo_49col"


def _code(r):
    return r.json()["detail"]["code"]


def test_mappings_api_crud_and_clone():
    r = client.get("/api/v1/mappings")
    assert r.status_code == 200 and any(m["id"] == DEFAULT and m["is_default"] for m in r.json())

    detail = client.get(f"/api/v1/mappings/{DEFAULT}").json()
    assert len(detail["columns"]) == 49 and "In Progress" in detail["value_mappings"]["status_map"]

    clone_r = client.post(f"/api/v1/mappings/{DEFAULT}/clone", json={"new_name": "API Clone"})
    assert clone_r.status_code == 200
    cloned = clone_r.json()
    assert cloned["name"] == "API Clone" and cloned["status"] == "draft" and cloned["is_default"] is False

    upd_r = client.put(f"/api/v1/mappings/{cloned['id']}", json={"description": "Updated via API"})
    assert upd_r.status_code == 200
    assert upd_r.json()["description"] == "Updated via API" and upd_r.json()["version"] == 2
    assert client.get(f"/api/v1/mappings/{DEFAULT}").json()["version"] == 1  # clone isolation

    assert client.delete(f"/api/v1/mappings/{cloned['id']}").status_code == 200
    assert client.get(f"/api/v1/mappings/{cloned['id']}").status_code == 404


def test_create_set_default_and_errors():
    body = {"name": "Mới", "columns": [], "value_mappings": {"status_map": {"Pending": "Tạm dừng"}}}
    created = client.post("/api/v1/mappings", json=body)
    assert created.status_code == 200 and created.json()["value_mappings"]["status_map"] == {"Pending": "Tạm dừng"}
    mid = created.json()["id"]
    assert client.post(f"/api/v1/mappings/{mid}/set-default").json()["is_default"] is True
    assert client.get(f"/api/v1/mappings/{DEFAULT}").json()["is_default"] is False
    assert _code(client.delete(f"/api/v1/mappings/{mid}")) == "E_CANNOT_DELETE_DEFAULT_MAPPING"
    client.post(f"/api/v1/mappings/{DEFAULT}/set-default")
    assert client.delete(f"/api/v1/mappings/{mid}").status_code == 200

    r = client.delete(f"/api/v1/mappings/{DEFAULT}")
    assert r.status_code == 400 and _code(r) == "E_CANNOT_DELETE_DEFAULT_MAPPING"
    assert _code(client.get("/api/v1/mappings/nope")) == "E_MAPPING_NOT_FOUND"
    assert client.put("/api/v1/mappings/nope", json={"name": "x"}).status_code == 404
    assert client.post("/api/v1/mappings/nope/clone", json={}).status_code == 404
    assert client.post("/api/v1/mapping/recalculate", json={"session_id": "nope"}).status_code == 404


def test_upload_with_mapping_id_and_draft_endpoints():
    custom = client.post(f"/api/v1/mappings/{DEFAULT}/clone", json={}).json()["id"]
    client.put(f"/api/v1/mappings/{custom}", json={"value_mappings": {"status_map": {"In Progress": "Đang làm gấp"}}})
    up = client.post(
        "/api/v1/ingest/upload", data={"cycle_id": "2026_09_w1", "mapping_id": custom},
        files={"file": ("g.csv", golden_csv(), "text/csv")},
    ).json()
    assert any(r["tt"] == "Đang làm gấp" for r in up["rows"])
    bad = client.post("/api/v1/ingest/demo", json={"cycle_id": "2026_11_w3", "mapping_id": "nope"})
    assert bad.status_code == 404

    sid = up["session_id"]
    body = {"session_id": sid, "cycle_id": "2026_09_w1", "rows": up["rows"][:1], "overrides": {"I.C.1.2": {"pic": "A"}}, "audit_logs": []}
    assert client.get(f"/api/v1/sessions/{sid}/draft").status_code == 404
    assert client.put("/api/v1/sessions/other/draft", json=body).status_code == 422
    assert client.put("/api/v1/sessions/nope/draft", json={**body, "session_id": "nope"}).status_code == 404
    saved = client.put(f"/api/v1/sessions/{sid}/draft", json=body)
    assert saved.status_code == 200 and saved.json()["success"] is True
    got = client.get(f"/api/v1/sessions/{sid}/draft").json()
    assert got["overrides"] == {"I.C.1.2": {"pic": "A"}} and got["rows"][0]["ma"] == up["rows"][0]["ma"]

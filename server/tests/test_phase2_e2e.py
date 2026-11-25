"""Mirrors the Postman flow of the Phase-2 spec (§5)."""
from fastapi.testclient import TestClient

from server.app.main import app
from server.tests.helpers import golden_csv

client = TestClient(app)


def test_full_phase2_postman_flow():
    # 1. list mappings -> seeded default
    mappings = client.get("/api/v1/mappings").json()
    assert any(m["id"] == "map_default_pmo_49col" and m["is_default"] for m in mappings)

    # 2-3. clone, then edit one rule of the clone only
    clone = client.post("/api/v1/mappings/map_default_pmo_49col/clone", json={"new_name": "PMO Postman Variant"}).json()
    clone_id = clone["id"]
    vm = client.get(f"/api/v1/mappings/{clone_id}").json()["value_mappings"]
    vm["status_map"]["In Progress"] = "Đang làm gấp"
    assert client.put(f"/api/v1/mappings/{clone_id}", json={"value_mappings": vm}).json()["version"] == 2
    default_vm = client.get("/api/v1/mappings/map_default_pmo_49col").json()["value_mappings"]
    assert default_vm["status_map"]["In Progress"] == "Đang thực hiện"

    # 4. upload (19 issues, default mapping): the out-of-catalog issue is an orphan
    demo = client.post("/api/v1/ingest/upload", data={"cycle_id": "2026_11_w3", "force_reload": "true"},
                       files={"file": ("golden.csv", golden_csv(), "text/csv")}).json()
    session_id = demo["session_id"]
    assert any(o["key"] == "PMOGOLD-18" for o in demo["orphans"])
    assert all(r["tt"] != "Đang làm gấp" for r in demo["rows"])

    # 5. recalculate: cloned mapping + orphan link + manual override
    recalc = client.post("/api/v1/mapping/recalculate", json={
        "session_id": session_id, "mapping_id": clone_id,
        "orphan_assignments": [{"key": "PMOGOLD-18", "target_ma_da": "I.C.1.2"}],
        "overrides": {"I.C.1.2": {"pic": "Chuyên Viên PMO Postman"}},
    }).json()
    assert recalc["success"] is True and recalc["session_id"] == session_id
    assert not any(o["key"] == "PMOGOLD-18" for o in recalc["orphans"])
    ic12 = next(r for r in recalc["rows"] if r["ma"] == "I.C.1.2")
    assert ic12["pic"] == "Chuyên Viên PMO Postman"
    assert any(s["key"] == "PMOGOLD-18" for s in ic12["subtasks"])
    assert ic12["tt"] == "Đang làm gấp"  # new mapping applied

    # 6-7. save + read draft
    log = {"at": "2026-11-19T22:30:00", "ma_da": "I.C.1.2", "field": "pic", "old_val": ic12["pic"], "new_val": "Chuyên Viên PMO Postman", "by": "Tester"}
    saved = client.put(f"/api/v1/sessions/{session_id}/draft", json={
        "session_id": session_id, "cycle_id": "2026_11_w3", "mapping_id": clone_id, "rows": recalc["rows"],
        "overrides": {"I.C.1.2": {"pic": "Chuyên Viên PMO Postman"}}, "audit_logs": [log],
    }).json()
    assert saved["success"] is True
    got = client.get(f"/api/v1/sessions/{session_id}/draft").json()
    assert got["session_id"] == session_id and got["mapping_id"] == clone_id
    assert got["overrides"] == {"I.C.1.2": {"pic": "Chuyên Viên PMO Postman"}} and got["audit_logs"] == [log]
    assert got["rows"] == recalc["rows"]


def test_e_no_code_blocker_cleared_by_orphan_assignment():
    up = client.post("/api/v1/ingest/upload", data={"cycle_id": "2026_08_w2"},
                     files={"file": ("g.csv", golden_csv("PKD-202"), "text/csv")}).json()
    assert any(b["code"] == "E_NO_CODE" and b["key"] == "PKD-202" for b in up["blockers"])

    recalc = client.post("/api/v1/mapping/recalculate", json={
        "session_id": up["session_id"], "orphan_assignments": [{"key": "PKD-202", "target_ma_da": "I.C.1.2"}],
    }).json()
    assert not any(b["code"] == "E_NO_CODE" and b["key"] == "PKD-202" for b in recalc["blockers"])
    assert not any(o["key"] == "PKD-202" for o in recalc["orphans"])
    ic12 = next(r for r in recalc["rows"] if r["ma"] == "I.C.1.2")
    assert any(s["key"] == "PKD-202" for s in ic12["subtasks"])

    bad = client.post("/api/v1/mapping/recalculate", json={
        "session_id": up["session_id"], "orphan_assignments": [{"key": "PKD-202", "target_ma_da": "Z.Z.9"}],
    })
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "E_ORPHAN_ASSIGNMENT_INVALID"

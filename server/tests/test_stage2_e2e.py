"""Stage 2 flow: upload -> save extended draft -> recalculate (Phương án A) -> draft survives."""
from fastapi.testclient import TestClient

from server.app.main import app
from server.tests.helpers import golden_csv

client = TestClient(app)


def test_stage2_full_draft_recalculate_preserve_and_audit_log():
    up = client.post("/api/v1/ingest/upload", data={"cycle_id": "2026_11_w3"},
                     files={"file": ("g.csv", golden_csv("S2E2E"), "text/csv")}).json()
    sid, rows = up["session_id"], up["rows"]
    ic12 = next(r for r in rows if r["ma"] == "I.C.1.2")
    ic12["pic"] = "Nguyễn Văn Tay"
    ic12["ovr"] = {"pic": "Nguyễn Văn Tay"}
    ic12["giatri"] = "Cao"

    put = client.put(f"/api/v1/sessions/{sid}/draft", json={
        "session_id": sid, "cycle_id": "2026_11_w3", "rows": rows,
        "overrides": {"I.C.1.2": {"pic": "Nguyễn Văn Tay"}},
        "fmt": {"0|ht": {"b": True, "color": "#B91C1C"}}, "wrap": {"0|ht": True}, "touched": {"0|pic": 1},
        "hidden": {"x": True}, "pin_viec": True, "ex_cols": "vis", "lock_by": "Khuê", "log_seq": 2, "lock_seq": 0,
        "audit_logs": [{"t": "02:15", "day": "26/11/2026", "seq": 1, "a": "Sửa tay ô lấy từ Jira",
                        "o": "I.C.1.2 · F PIC", "d": "A → Nguyễn Văn Tay", "r": "Thành công"}],
    })
    assert put.status_code == 200

    rec = client.post("/api/v1/mapping/recalculate", json={
        "session_id": sid, "src_overrides": {"phong": "Components"}}).json()
    row = next(r for r in rec["rows"] if r["ma"] == "I.C.1.2")
    assert row["ovr"]["pic"] == "Nguyễn Văn Tay" and row["giatri"] == "Cao"

    got = client.get(f"/api/v1/sessions/{sid}/draft").json()
    assert got["fmt"]["0|ht"]["b"] is True and got["wrap"]["0|ht"] is True
    assert len(got["audit_logs"]) == 1 and got["log_seq"] == 2
    assert next(r for r in got["rows"] if r["ma"] == "I.C.1.2")["giatri"] == "Cao"

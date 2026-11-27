"""End-to-end against the real golden dataset (19 issues, 88 columns, 6 main DA rows).

Deviations from the plan text, forced by the real fixture: its epics are I.A.3.1 / I.A.4.1 /
I.A.5.2 / I.C.1.2 (not I.C.1.2-1.5), PMOGOLD-18 is its only orphan, and `PKD-202` does not exist -
the E_NO_CODE flow is exercised by appending a code-less issue in memory (fixture file untouched).
"""
import csv
import io
import json
import os

from fastapi.testclient import TestClient

from server.app.core.config import settings
from server.app.core.database import SessionLocal
from server.app.main import app
from server.app.models.session import IngestSession

client = TestClient(app)
GOLDEN = os.path.join(settings.FIXTURES_DIR, "golden_dataset.csv")


def _upload(content: bytes, cycle="2026_11_w3", force=True):
    r = client.post(
        "/api/v1/ingest/upload",
        files={"file": ("golden_dataset.csv", content, "text/csv")},
        data={"cycle_id": cycle, "force_reload": str(force).lower()},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _edited_csv(edit) -> bytes:
    """Golden CSV re-serialised after `edit(header, rows)` (rows are lists, duplicate headers safe)."""
    rows = list(csv.reader(io.StringIO(open(GOLDEN, "rb").read().decode("utf-8-sig"), newline="")))
    header, body = rows[0], rows[1:]
    edit(header, body)
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows([header, *body])
    return out.getvalue().encode("utf-8")


def test_e2e_golden_dataset_processing():
    data = _upload(open(GOLDEN, "rb").read())
    assert data["success"] is True
    assert data["file_stats"]["total_rows"] == 19
    assert data["file_stats"]["total_cols"] == 88
    assert data["file_stats"]["matched_projects"] == 7

    rows = {r["ma"]: r for r in data["rows"]}
    assert set(rows) == {"I.A.3.1", "I.A.4.1", "I.A.4.2", "I.A.4.3", "I.A.5.2", "I.C.1.2", "IV.Z.99.99"}

    # Choice A: children (incl. grandchildren and the x.x.x placeholder) are audit subtasks only
    assert [s["key"] for s in rows["I.C.1.2"]["subtasks"]] == [f"PMOGOLD-{n}" for n in (15, 16, 17, 21, 22)]
    assert [s["key"] for s in rows["I.A.3.1"]["subtasks"]] == [f"PMOGOLD-{n}" for n in (8, 9, 10, 19, 20)]
    assert [s["key"] for s in rows["I.A.5.2"]["subtasks"]] == ["PMOGOLD-13", "PMOGOLD-14"]
    assert rows["I.A.5.2"]["tt"] == "Đang thực hiện"  # not rolled up from Done/Monitoring children

    assert data["orphans"] == []
    assert rows["IV.Z.99.99"]["isNew"] is True and rows["IV.Z.99.99"]["key"] == "PMOGOLD-18"
    assert all(r["g"] in {g["k"] for g in data["groups"]} for r in data["rows"])
    assert not any(b["code"] == "E_NO_CODE" for b in data["blockers"])

    # Progress Report wiki table split over W1..W4 (I.C.1.2 has entries 10-16 .. 11-15)
    ic = rows["I.C.1.2"]
    assert "pilot giai đoạn 1" in ic["w1ht"] and "Kafka" in ic["w1vd"]
    assert "Tăng số lượng partition Kafka" in ic["w1kh"]
    assert "30% cuốc xe" in ic["w2ht"] and "fallback heuristic" in ic["w2vd"]
    assert "nghiệm thu kỹ thuật" in ic["ht"] and "Hội đồng Kiến trúc" in ic["kh"]
    assert ic["w4ht"] == "" and ic["w4vd"] == ""
    assert "{{" not in ic["milestone"] and "2026-12-31" in ic["milestone"]
    assert ic["tt1"] == "Đang thực hiện Đúng tiến độ" and ic["market"] == ""

    warn = {(w["code"], w["key"]) for w in data["warnings"]}
    assert ("W_PROGRESS_CONFLICT", "PMOGOLD-7") in warn  # on-track but Blockers recorded
    assert ("W_UNMAPPED_VALUE", "PMOGOLD-5") in warn  # progress 'Late' is not in the PMO table
    assert ("W_UNMAPPED_VALUE", "PMOGOLD-14") in warn  # spec §8.1 example: subtask status 'Monitoring'
    assert ("W_UNMAPPED_VALUE", "PMOGOLD-17") in warn  # spec §7.5 example: typo 'Cancled'
    assert "Phạm D" not in ic["muctieu"] and ic["muctieu"].startswith("1. BÀI TOÁN")


def test_e2e_issue_without_da_code_is_blocker_and_orphan():
    def add_issue(header, rows):
        new = [""] * len(header)
        new[header.index("Summary")], new[header.index("Issue key")] = "Hỗ trợ họp PMO không mã DA", "PKD-202"
        new[header.index("Issue Type")], new[header.index("Status")] = "Task", "Open"
        rows.append(new)

    data = _upload(_edited_csv(add_issue), cycle="2026_11_w2")
    assert any(o["key"] == "PKD-202" and o["reason"] == "NO_DA_CODE" for o in data["orphans"])
    assert any(b["code"] == "E_NO_CODE" and b["key"] == "PKD-202" for b in data["blockers"])
    assert len(data["rows"]) == 7  # pipeline did not crash or lose projects


def test_e2e_reupload_keeps_user_override_and_flags_changed_source():
    cycle = "2026_11_w1"
    first = _upload(open(GOLDEN, "rb").read(), cycle=cycle)
    with SessionLocal() as db:  # simulate the user's manual edit on the stored session
        sess = db.get(IngestSession, first["session_id"])
        resp = json.loads(sess.response_json)
        ic = next(r for r in resp["rows"] if r["ma"] == "I.C.1.2")
        ic["pic"], ic["ovr"] = "Manual PIC", {"pic": "Manual PIC"}
        sess.response_json = json.dumps(resp, ensure_ascii=False)
        db.commit()

    def change_po(header, rows):
        i_key, i_po = header.index("Issue key"), header.index("Custom field (PO)")
        for r in rows:
            if r[i_key] == "PMOGOLD-7":
                r[i_po] = "Người Mới"

    second = _upload(_edited_csv(change_po), cycle=cycle)
    ic = next(r for r in second["rows"] if r["ma"] == "I.C.1.2")
    assert ic["pic"] == "Manual PIC" and ic["needs_review"] is True
    assert second["diff_summary"]["modified_count"] == 1
    others = [r for r in second["rows"] if r["ma"] != "I.C.1.2"]
    assert not any(r["needs_review"] for r in others)

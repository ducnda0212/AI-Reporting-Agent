import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import SessionLocal
from app.main import app
from app.models.session import SessionDraft
from app.modules.reporting.service import get_version, list_versions, lock_report
from app.schemas.mapping import SessionDraftSaveRequest
from app.schemas.reporting import LockReportRequest
from app.modules.session.service import save_session_draft


@pytest.fixture(scope="module")
def sid():
    with open(f"{settings.FIXTURES_DIR}/golden_dataset.csv", "rb") as f:
        up = TestClient(app).post("/api/v1/ingest/upload", files={"file": ("g.csv", f, "text/csv")},
                                  data={"cycle_id": "2026_11_w3", "force_reload": "true"}).json()
    return up["session_id"]


def _req(sid, cycle="2026_11_w1", wk="w1", **kw):
    return LockReportRequest(session_id=sid, cycle_id=cycle, wk=wk, by="Khuê",
                             snap=kw.pop("snap", {"I.C.1.2|ma": "I.C.1.2"}), **kw)


def test_lock_numbering_changes_and_month_isolation(sid):
    with SessionLocal() as db:
        nov1 = lock_report(db, _req(sid, snap={"I.C.1.2|ma": "I.C.1.2", "I.C.1.2|pic": "An"}, raw_notes={"I.C.1.2": "A · B"}))
        nov2 = lock_report(db, _req(sid, snap={"I.C.1.2|ma": "I.C.1.2", "I.C.1.2|pic": "Bình"}))
        dec1 = lock_report(db, _req(sid, cycle="2026_10_w1", snap={"I.C.1.2|pic": "Bình"}))
        assert (nov1.v, nov2.v, dec1.v) == (1, 2, 1)
        assert nov1.id == "ver_2026_11_w1_v1" and dec1.id == "ver_2026_10_w1_v1"
        assert nov2.changes == [["I.C.1.2", "F PIC", "An", "Bình"]]
        assert [v.id for v in list_versions(db, cycle_month="2026_11", wk="w1")] == [nov2.id, nov1.id]
        assert [v.id for v in list_versions(db, cycle_month="2026_10")] == [dec1.id]
        assert {v.id for v in list_versions(db)} >= {nov1.id, nov2.id}  # pinned 2026_11_w3 -> November
        assert dec1.id in {v.id for v in list_versions(db, cycle_month="all")}
        assert get_version(db, nov1.id).raw_notes_json == '{"I.C.1.2": "A · B"}'


def test_lock_validation(sid):
    with SessionLocal() as db:
        with pytest.raises(LookupError, match="E_SESSION_NOT_FOUND"):
            lock_report(db, _req("nope"))
        with pytest.raises(ValueError, match="E_LOCK_BY_REQUIRED"):
            lock_report(db, _req(sid).model_copy(update={"by": "  "}))
        with pytest.raises(ValueError, match="E_CYCLE_INVALID"):
            lock_report(db, _req(sid, cycle="2026-11"))
        with pytest.raises(LookupError, match="E_VERSION_NOT_FOUND"):
            get_version(db, "ver_x")


def test_lock_extracts_edits_after_lock_seq_and_syncs_draft(sid):
    with SessionLocal() as db:
        save_session_draft(db, SessionDraftSaveRequest.model_validate({
            "session_id": sid, "cycle_id": "2026_11_w3", "rows": [], "lock_seq": 1, "log_seq": 3,
            "audit_logs": [{"seq": 1, "a": "Sửa ô", "o": "old"}, {"seq": 2, "a": "Sửa ô", "o": "I.C.1.2 · F PIC", "d": "An → Bình"},
                           {"seq": 3, "a": "Xuất báo cáo", "o": "x"}],
        }))
        v = lock_report(db, _req(sid, cycle="2026_11_w2", wk="w2", log_seq=3))
        assert [(e.a, e.o) for e in v.edits] == [("Sửa ô", "I.C.1.2 · F PIC")]
        draft = db.get(SessionDraft, sid)
        assert (draft.lock_by, draft.lock_seq) == ("Khuê", 3)

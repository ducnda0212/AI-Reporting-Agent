import json

from server.app.core.database import Base, SessionLocal, engine
from server.app.modules.session.service import get_session_draft, save_session_draft
from server.app.schemas.mapping import SessionDraftSaveRequest

ROWS = [{"stt": 1, "ma_da": "I.C.1.2", "cong_viec": "Task 1"}]
LOG = {"at": "2026-11-19T22:00:00", "ma_da": "I.C.1.2", "field": "pic", "old_val": "Cũ", "new_val": "Mới", "by": "PMO"}


def _req(**kw):
    return SessionDraftSaveRequest(**{
        "session_id": "sess_draft_001", "cycle_id": "2026_11_w3", "mapping_id": "map_default_pmo_49col",
        "rows": ROWS, "overrides": {"I.C.1.2": {"pic": "Chuyên Viên A"}}, "audit_logs": [LOG], **kw,
    })


def test_session_draft_save_and_retrieve():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    assert get_session_draft(db, "sess_draft_001") is None
    draft = save_session_draft(db, _req())
    assert draft.session_id == "sess_draft_001"

    retrieved = get_session_draft(db, "sess_draft_001")
    assert retrieved is not None
    assert retrieved.cycle_id == "2026_11_w3"
    assert "Chuyên Viên A" in retrieved.overrides_json
    assert json.loads(retrieved.rows_json)[0]["ma_da"] == "I.C.1.2"
    assert json.loads(retrieved.audit_logs_json) == [LOG]

    # second save = upsert, not a duplicate row
    save_session_draft(db, _req(overrides={"I.C.1.2": {"pic": "Chuyên Viên B"}}))
    assert "Chuyên Viên B" in get_session_draft(db, "sess_draft_001").overrides_json
    assert db.query(type(retrieved)).filter_by(session_id="sess_draft_001").count() == 1
    db.close()

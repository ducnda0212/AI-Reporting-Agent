import json

import sqlalchemy as sa

from app.core.database import Base, SessionLocal, engine
from app.modules.mapping.seed import migrate_schema
from app.modules.session.service import get_session_draft, save_session_draft
from app.schemas.mapping import AuditLogEntry, SessionDraftSaveRequest

ROWS = [{"i": 0, "ma": "I.C.1.2", "viec": "Task 1"}]
LOG = {"t": "22:00", "day": "19/11/2026", "seq": 1, "a": "Sửa ô", "o": "I.C.1.2 · F PIC", "d": "Cũ → Mới", "r": "Thành công"}


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
    assert json.loads(retrieved.rows_json)[0]["ma"] == "I.C.1.2"
    assert json.loads(retrieved.audit_logs_json) == [LOG]

    # second save = upsert, not a duplicate row
    save_session_draft(db, _req(overrides={"I.C.1.2": {"pic": "Chuyên Viên B"}}))
    assert "Chuyên Viên B" in get_session_draft(db, "sess_draft_001").overrides_json
    assert db.query(type(retrieved)).filter_by(session_id="sess_draft_001").count() == 1
    db.close()


def test_extended_draft_schema_and_migration():
    Base.metadata.create_all(bind=engine)
    migrate_schema(engine)
    migrate_schema(engine)  # idempotent
    cols = {c["name"] for c in sa.inspect(engine).get_columns("session_drafts")}
    for needed in ("fmt_json", "wrap_json", "touched_json", "hidden_json", "pin_viec", "ex_cols", "lock_by", "log_seq", "lock_seq"):
        assert needed in cols

    req = _req(
        session_id="sess_s2_01", fmt={"0|ht": {"b": True, "color": "#B91C1C"}}, wrap={"0|ht": True},
        touched={"0|pic": 1}, hidden={"x": True}, pin_viec=False, ex_cols="all", lock_by="An", log_seq=2, lock_seq=1,
        audit_logs=[AuditLogEntry(t="02:10", day="26/11/2026", seq=1, a="Sửa ô", o="I.C.1.2 · F", d="A → B", r="Thành công")],
    )
    assert req.fmt["0|ht"]["b"] is True and req.audit_logs[0].r == "Thành công"

    from app.modules.session.service import draft_out
    db = SessionLocal()
    out = draft_out(save_session_draft(db, req))
    assert (out.fmt, out.wrap, out.touched, out.hidden) == (req.fmt, req.wrap, req.touched, req.hidden)
    assert (out.pin_viec, out.ex_cols, out.lock_by, out.log_seq, out.lock_seq) == (False, "all", "An", 2, 1)
    assert out.audit_logs == req.audit_logs
    db.close()

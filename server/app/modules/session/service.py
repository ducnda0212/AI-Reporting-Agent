import json

from sqlalchemy.orm import Session

from app.models.session import SessionDraft
from app.schemas.mapping import SessionDraftOut, SessionDraftSaveRequest


def _dump(items) -> str:
    return json.dumps(items, ensure_ascii=False)


def save_session_draft(db: Session, data: SessionDraftSaveRequest) -> SessionDraft:
    """Upsert: one draft per session, the latest save wins."""
    draft = db.get(SessionDraft, data.session_id) or SessionDraft(session_id=data.session_id)
    draft.cycle_id, draft.mapping_id = data.cycle_id, data.mapping_id
    draft.rows_json = _dump([r.model_dump(mode="json") for r in data.rows])
    draft.overrides_json = _dump(data.overrides)
    draft.audit_logs_json = _dump([a.model_dump(mode="json") for a in data.audit_logs])
    draft.fmt_json, draft.wrap_json = _dump(data.fmt), _dump(data.wrap)
    draft.touched_json, draft.hidden_json = _dump(data.touched), _dump(data.hidden)
    draft.pin_viec, draft.ex_cols, draft.lock_by = data.pin_viec, data.ex_cols, data.lock_by
    draft.log_seq, draft.lock_seq = data.log_seq, data.lock_seq
    db.add(draft)
    db.commit()
    return draft


def get_session_draft(db: Session, session_id: str) -> SessionDraft | None:
    return db.get(SessionDraft, session_id)


def draft_out(d: SessionDraft) -> SessionDraftOut:
    return SessionDraftOut(
        session_id=d.session_id, cycle_id=d.cycle_id, mapping_id=d.mapping_id, rows=json.loads(d.rows_json),
        overrides=json.loads(d.overrides_json), audit_logs=json.loads(d.audit_logs_json),
        fmt=json.loads(d.fmt_json), wrap=json.loads(d.wrap_json), touched=json.loads(d.touched_json),
        hidden=json.loads(d.hidden_json), pin_viec=d.pin_viec, ex_cols=d.ex_cols, lock_by=d.lock_by,
        log_seq=d.log_seq, lock_seq=d.lock_seq, updated_at=d.updated_at,
    )

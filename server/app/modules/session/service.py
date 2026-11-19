import json

from sqlalchemy.orm import Session

from server.app.models.session import SessionDraft
from server.app.schemas.mapping import SessionDraftOut, SessionDraftSaveRequest


def _dump(items) -> str:
    return json.dumps(items, ensure_ascii=False)


def save_session_draft(db: Session, data: SessionDraftSaveRequest) -> SessionDraft:
    """Upsert: one draft per session, the latest save wins."""
    draft = db.get(SessionDraft, data.session_id) or SessionDraft(session_id=data.session_id)
    draft.cycle_id, draft.mapping_id = data.cycle_id, data.mapping_id
    draft.rows_json = _dump([r.model_dump(mode="json") for r in data.rows])
    draft.overrides_json = _dump(data.overrides)
    draft.audit_logs_json = _dump([a.model_dump(mode="json") for a in data.audit_logs])
    db.add(draft)
    db.commit()
    return draft


def get_session_draft(db: Session, session_id: str) -> SessionDraft | None:
    return db.get(SessionDraft, session_id)


def draft_out(d: SessionDraft) -> SessionDraftOut:
    return SessionDraftOut(
        session_id=d.session_id, cycle_id=d.cycle_id, mapping_id=d.mapping_id, rows=json.loads(d.rows_json),
        overrides=json.loads(d.overrides_json), audit_logs=json.loads(d.audit_logs_json), updated_at=d.updated_at,
    )

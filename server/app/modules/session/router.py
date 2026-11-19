from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from server.app.core.database import get_db
from server.app.core.errors import api_error
from server.app.models.session import IngestSession
from server.app.modules.session.service import draft_out, get_session_draft, save_session_draft
from server.app.schemas.mapping import SessionDraftOut, SessionDraftSaveRequest

router = APIRouter(prefix="/api/v1/sessions", tags=["session"])


@router.put("/{session_id}/draft")
def save_draft(session_id: str, data: SessionDraftSaveRequest, db: Session = Depends(get_db)):
    if data.session_id != session_id:
        raise api_error(422, "E_SESSION_ID_MISMATCH", "session_id trong body khác với URL")
    if db.get(IngestSession, session_id) is None:
        raise api_error(404, "E_SESSION_NOT_FOUND")
    draft = save_session_draft(db, data)
    return {"success": True, "session_id": draft.session_id, "updated_at": draft.updated_at}


@router.get("/{session_id}/draft", response_model=SessionDraftOut)
def get_draft(session_id: str, db: Session = Depends(get_db)):
    draft = get_session_draft(db, session_id)
    if draft is None:
        raise api_error(404, "E_DRAFT_NOT_FOUND")
    return draft_out(draft)

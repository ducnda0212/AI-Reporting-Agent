"""Re-run a stored session under another MappingConfig, with orphan links and manual overrides.

Raises LookupError(E_SESSION_NOT_FOUND | E_MAPPING_NOT_FOUND | E_FILE_NOT_FOUND) and
ValueError(E_ORPHAN_ASSIGNMENT_INVALID | E_OVERRIDE_INVALID_FIELD).
shortcut: orphan links are not persisted - the client resends them on every recalculate; upgrade when the UI needs it.
"""
import json
from pathlib import Path

from sqlalchemy.orm import Session

from server.app.models.file import UploadedFile
from server.app.models.session import IngestSession
from server.app.modules.ingestion.diff_engine import SOURCE_FIELDS
from server.app.modules.ingestion.service import run_pipeline
from server.app.modules.mapping.service import mapping_or_default
from server.app.schemas.ingest import IngestResponse
from server.app.schemas.mapping import OrphanAssignment


def recalculate_session(
    session_id: str, mapping_id: str | None, orphan_assignments: list[OrphanAssignment],
    overrides: dict[str, dict[str, str]], db: Session,
) -> IngestResponse:
    session = db.get(IngestSession, session_id)
    if session is None:
        raise LookupError("E_SESSION_NOT_FOUND")
    mapping = mapping_or_default(db, mapping_id)  # LookupError(E_MAPPING_NOT_FOUND) for an unknown id
    if bad := sorted({f for fields in overrides.values() for f in fields} - SOURCE_FIELDS):
        raise ValueError(f"E_OVERRIDE_INVALID_FIELD: {', '.join(bad)}")
    stored = db.get(UploadedFile, session.file_id)
    if stored is None or not Path(stored.stored_path).is_file():
        raise LookupError("E_FILE_NOT_FOUND")

    assignments = {a.key: a.target_ma_da for a in orphan_assignments}
    response, source_rows, _ = run_pipeline(
        Path(stored.stored_path).read_bytes(), session.cycle_id, session, mapping, assignments, overrides,
    )
    attached = {(s.key, r.ma_da) for r in response.rows for s in r.subtasks}
    if unresolved := [a for a in orphan_assignments if (a.key, a.target_ma_da) not in attached]:
        raise ValueError("E_ORPHAN_ASSIGNMENT_INVALID: " + ", ".join(f"{a.key}->{a.target_ma_da}" for a in unresolved))

    response = response.model_copy(update={"session_id": session.id})  # same session, updated in place
    session.source_rows_json = json.dumps([r.model_dump(mode="json") for r in source_rows], ensure_ascii=False)
    session.response_json = response.model_dump_json()
    db.commit()
    return response

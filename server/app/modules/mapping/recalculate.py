"""Re-run a stored session under another MappingConfig, with orphan links and manual overrides.

Raises LookupError(E_SESSION_NOT_FOUND | E_MAPPING_NOT_FOUND | E_FILE_NOT_FOUND) and
ValueError(E_ORPHAN_ASSIGNMENT_INVALID | E_OVERRIDE_INVALID_FIELD | E_SRC_OVERRIDE_INVALID_FIELD).
The diff stays against the session's own baseline (the upload before it), never against the session itself.
A mapping preview (`src_overrides`, inline `value_mappings`) updates the session but never the saved MappingConfig.
shortcut: orphan links are not persisted - the client resends them on every recalculate; upgrade when the UI needs it.
"""
import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.file import UploadedFile
from app.models.session import IngestSession, SessionDraft
from app.modules.ingestion.service import run_pipeline
from app.modules.mapping.service import mapping_or_default
from app.schemas.ingest import IngestResponse
from app.schemas.mapping import OrphanAssignment, ValueMappings
from app.schemas.row import SOURCE_FIELDS


# Hand-entered columns (and AI output) a Jira re-map must never wipe; loai/market/link only fill a blank.
MANUAL_PRESERVED_FIELDS = ("output", "note", "caitien", "prio", "giatri", "rui", "action", "nextstep", "domain", "uoctinh")
MANUAL_FILL_BLANK_FIELDS = ("loai", "market", "link")


def _merge_draft(response: IngestResponse, draft: SessionDraft) -> list[dict]:
    """Phương án A: lay the draft's hand-entered values (by `ma`) over the freshly mapped rows."""
    old = {r["ma"]: r for r in json.loads(draft.rows_json) if r.get("ma")}
    for row in response.rows:
        prev = old.get(row.ma)
        if prev is None:
            continue
        for f in MANUAL_PRESERVED_FIELDS:
            setattr(row, f, prev.get(f, ""))
        for f in MANUAL_FILL_BLANK_FIELDS:
            if not getattr(row, f):
                setattr(row, f, prev.get(f, ""))
        row.ai, row.reasons = prev.get("ai") or {}, prev.get("reasons") or {}
    return [r.model_dump(mode="json") for r in response.rows]


def recalculate_session(
    session_id: str, mapping_id: str | None, orphan_assignments: list[OrphanAssignment],
    overrides: dict[str, dict[str, str]], db: Session,
    src_overrides: dict[str, str] | None = None, value_mappings: ValueMappings | None = None,
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

    draft = db.get(SessionDraft, session_id)
    if draft is not None:  # saved edits take part, the request's overrides win
        saved = {ma: {f: v for f, v in fields.items() if f in SOURCE_FIELDS} for ma, fields in json.loads(draft.overrides_json).items()}
        overrides = {ma: {**saved.get(ma, {}), **overrides.get(ma, {})} for ma in saved.keys() | overrides.keys()}

    baseline = db.get(IngestSession, session.baseline_session_id) if session.baseline_session_id else None
    assignments = {a.key: a.target_ma_da for a in orphan_assignments}
    response, source_rows, _ = run_pipeline(
        Path(stored.stored_path).read_bytes(), stored.original_name, session.cycle_id, baseline, mapping, assignments,
        overrides, current=session, src_overrides=src_overrides, vm_overrides=value_mappings,
    )
    attached = {(s.key, r.ma) for r in response.rows for s in r.subtasks}
    if unresolved := [a for a in orphan_assignments if (a.key, a.target_ma_da) not in attached]:
        raise ValueError("E_ORPHAN_ASSIGNMENT_INVALID: " + ", ".join(f"{a.key}->{a.target_ma_da}" for a in unresolved))

    response = response.model_copy(update={"session_id": session.id})  # same session, updated in place
    session.source_rows_json = json.dumps([r.model_dump(mode="json") for r in source_rows], ensure_ascii=False)
    if draft is not None:
        draft.rows_json = json.dumps(_merge_draft(response, draft), ensure_ascii=False)
        draft.overrides_json = json.dumps({r.ma: r.ovr for r in response.rows if r.ovr}, ensure_ascii=False)
        draft.mapping_id = mapping.id
    session.response_json = response.model_dump_json()
    db.commit()
    return response

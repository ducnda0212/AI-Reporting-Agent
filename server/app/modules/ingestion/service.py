"""CSV bytes -> IngestResponse: clean, reconcile (77 rules), validate, diff."""
import json
import uuid
from datetime import datetime

from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from server.app.models.file import UploadedFile
from server.app.models.session import IngestSession
from server.app.modules.ingestion.cycles import reference_date, weeks_for_cycle
from server.app.modules.ingestion.diff_engine import compute_diff
from server.app.modules.ingestion.validator import validate_rows
from server.app.modules.mapping.catalog import load_catalog
from server.app.modules.mapping.csv_cleaner import clean_csv
from server.app.modules.mapping.reconciler import reconcile_issues
from server.app.schemas.ingest import FileStats, IngestResponse
from server.app.schemas.row import ReportRow

_ROWS = TypeAdapter(list[ReportRow])
DEMO_USER = "demo"  # UploadedFile.uploaded_by of the golden-dataset demo


def latest_session(db: Session, cycle_id: str) -> IngestSession | None:
    """Newest real upload of the cycle; demo sessions never act as the baseline of a diff."""
    return (db.query(IngestSession).join(UploadedFile, UploadedFile.id == IngestSession.file_id)
            .filter(IngestSession.cycle_id == cycle_id, UploadedFile.uploaded_by != DEMO_USER)
            .order_by(IngestSession.created_at.desc()).first())


def save_session(
    db: Session, cycle_id: str, file_id: int, response: IngestResponse, source_rows: list[ReportRow], headers: list[str],
) -> None:
    db.add(IngestSession(
        id=response.session_id, cycle_id=cycle_id, file_id=file_id,
        headers_json=json.dumps(headers, ensure_ascii=False),
        source_rows_json=json.dumps([r.model_dump(mode="json") for r in source_rows], ensure_ascii=False),
        response_json=response.model_dump_json(),
    ))
    db.commit()


def run_pipeline(
    file_bytes: bytes, cycle_id: str, previous: IngestSession | None,
    mapping=None, assignments: dict[str, str] | None = None, overrides: dict[str, dict[str, str]] | None = None,
) -> tuple[IngestResponse, list[ReportRow], list[str]]:
    """Recalculate extras: `mapping` (MappingConfig|None), `assignments` ({orphan key: ma_da}) and `overrides`
    ({ma_da: {field: value}}, merged over those carried by `previous`). Plain ingestion passes none of them."""
    headers, records, skipped = clean_csv(file_bytes)
    weeks = weeks_for_cycle(cycle_id)
    source_rows, orphans = reconcile_issues(records, load_catalog(), weeks, mapping, assignments)

    prev_source = _ROWS.validate_json(previous.source_rows_json) if previous else None
    merged: dict[str, dict[str, str]] = {}
    if previous:
        prev_resp = json.loads(previous.response_json)
        merged = {r["ma_da"]: r["overrides"] for r in prev_resp["rows"] if r.get("overrides")}
    for ma_da, fields in (overrides or {}).items():
        merged[ma_da] = {**merged.get(ma_da, {}), **fields}
    overrides = merged
    diff, rows = compute_diff(prev_source, source_rows, overrides)
    if previous:
        old = set(json.loads(previous.headers_json))
        diff.schema_changes = [f"+{h}" for h in headers if h not in old] + [f"-{h}" for h in old if h not in headers]

    blockers, warnings = validate_rows(rows, orphans, reference_date(cycle_id))
    response = IngestResponse(
        success=True,
        session_id=f"sess_{datetime.now():%Y%m%d}_{uuid.uuid4().hex[:6]}",
        is_duplicate_file=False,
        file_stats=FileStats(total_rows=len(records), total_cols=len(headers),
                             skipped_empty_rows=skipped, matched_projects=len(rows)),
        diff_summary=diff, rows=rows, orphans=orphans, blockers=blockers, warnings=warnings,
    )
    return response, source_rows, headers

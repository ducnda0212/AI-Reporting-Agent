"""File bytes (CSV / Excel) -> IngestResponse: clean, reconcile (77 rules), validate, diff."""
import json
import re
import uuid
from datetime import datetime

from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from server.app.models.session import IngestSession
from server.app.modules.ingestion.cycles import reference_date, weeks_for_cycle
from server.app.modules.ingestion.diff_engine import compute_diff
from server.app.modules.ingestion.validator import validate_rows
from server.app.modules.mapping.catalog import load_catalog
from server.app.modules.mapping.reconciler import reconcile_issues
from server.app.modules.mapping.resolved import MAPPABLE, resolve_mapping
from server.app.modules.mapping.tabular_reader import read_tabular
from server.app.schemas.ingest import AppliedMappingInfo, FileStats, GroupInfo, IngestResponse
from server.app.schemas.row import COLUMN_FIELDS, ReportRow

_ROWS = TypeAdapter(list[ReportRow])
_GROUP_CODE = re.compile(r"^([IVX]+\.[A-Z0-9]+\.\d+)")


def latest_session(db: Session, cycle_id: str) -> IngestSession | None:
    """Newest upload of the cycle: the diff baseline of the next one."""
    return db.query(IngestSession).filter_by(cycle_id=cycle_id).order_by(IngestSession.created_at.desc()).first()


def save_session(
    db: Session, cycle_id: str, file_id: int, response: IngestResponse, source_rows: list[ReportRow], headers: list[str],
    baseline_session_id: str | None = None,
) -> None:
    db.add(IngestSession(
        id=response.session_id, cycle_id=cycle_id, file_id=file_id, baseline_session_id=baseline_session_id,
        headers_json=json.dumps(headers, ensure_ascii=False),
        source_rows_json=json.dumps([r.model_dump(mode="json") for r in source_rows], ensure_ascii=False),
        response_json=response.model_dump_json(),
    ))
    db.commit()


def catalog_groups(catalog: dict) -> list[GroupInfo]:
    """Workstreams of the template in sheet order: {k: "I.C.1", name: "I.C.1.Bộ giải pháp ..."}."""
    names = list(dict.fromkeys(e["mang_viec"] for e in catalog.values() if e["mang_viec"]))
    return [GroupInfo(k=m[1] if (m := _GROUP_CODE.match(n)) else n, name=n) for n in names]


def run_pipeline(
    file_bytes: bytes, filename: str, cycle_id: str, baseline: IngestSession | None,
    mapping=None, assignments: dict[str, str] | None = None, overrides: dict[str, dict[str, str]] | None = None,
    current: IngestSession | None = None, src_overrides: dict[str, str] | None = None, vm_overrides=None,
) -> tuple[IngestResponse, list[ReportRow], list[str]]:
    """`baseline`: previous upload of the cycle (diff base). `current`: the session being recalculated, whose manual
    overrides are carried (a plain upload carries the baseline's). Extras: `mapping` (MappingConfig|None),
    `assignments` ({orphan key: ma}), `overrides` ({ma: {field: value}}), unsaved `src_overrides` / `vm_overrides`."""
    if bad := sorted(set(src_overrides or {}) - MAPPABLE):
        raise ValueError(f"E_SRC_OVERRIDE_INVALID_FIELD: {', '.join(bad)}")
    tab = read_tabular(file_bytes, filename)
    headers = tab.headers
    weeks = weeks_for_cycle(cycle_id)
    ref = reference_date(cycle_id)
    catalog = load_catalog()
    mp = resolve_mapping(mapping, src_overrides, vm_overrides)
    source_rows, orphans = reconcile_issues(tab.records, catalog, weeks, mp, assignments, ref)

    prev_source = _ROWS.validate_json(baseline.source_rows_json) if baseline else None
    merged: dict[str, dict[str, str]] = {}
    carry = current or baseline
    if carry:
        merged = {r["ma"]: r["ovr"] for r in json.loads(carry.response_json)["rows"] if r.get("ovr")}
    for ma, fields in (overrides or {}).items():
        merged[ma] = {**merged.get(ma, {}), **fields}
    diff, rows = compute_diff(prev_source, source_rows, merged)
    if baseline:
        old = set(json.loads(baseline.headers_json))
        diff.schema_changes = [f"+{h}" for h in headers if h not in old] + [f"-{h}" for h in old if h not in headers]

    blockers, warnings = validate_rows(rows, orphans, ref)
    file_cols = set(tab.unique_raw_cols)
    response = IngestResponse(
        success=True,
        session_id=f"sess_{datetime.now():%Y%m%d}_{uuid.uuid4().hex[:6]}",
        file_name=filename,
        is_duplicate_file=False,
        file_stats=FileStats(
            total_rows=len(tab.records), total_cols=len(headers), skipped_empty_rows=tab.skipped_empty_rows,
            matched_projects=len(rows), dup_groups=tab.dup_groups, dup_cols=tab.dup_cols, used_cols=mp.used(file_cols),
        ),
        file_cols=tab.unique_raw_cols, groups=catalog_groups(catalog),
        applied_mapping=AppliedMappingInfo(
            id=getattr(mapping, "id", ""), name=getattr(mapping, "name", ""),
            matched_cols=mp.matched(file_cols), total_cols=len(COLUMN_FIELDS),
        ),
        diff_summary=diff, rows=rows, orphans=orphans, blockers=blockers, warnings=warnings,
    )
    return response, source_rows, headers

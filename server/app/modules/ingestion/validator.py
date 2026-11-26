from datetime import date

from server.app.modules.ingestion.cross_validator import (
    is_active, progress_conflicts, unmapped_subtask_statuses, unmapped_values,
)
from server.app.schemas.ingest import BlockerIssue, OrphanIssue, WarningIssue
from server.app.schemas.row import ReportRow

REQUIRED_FIELDS = ("pic", "start", "end")


def validate_rows(
    rows: list[ReportRow], orphans: list[OrphanIssue], ref_date: date
) -> tuple[list[BlockerIssue], list[WarningIssue]]:
    blockers = [
        BlockerIssue(code="E_NO_CODE", key=o.key, message=f"{o.key}: không có mã DA ở đầu Summary")
        for o in orphans if o.reason == "NO_DA_CODE"
    ]
    for r in rows:
        if not is_active(r):
            continue
        blockers += [
            BlockerIssue(code="E_REQUIRED", key=r.key or r.ma, field=f,
                         message=f"{r.ma}: thiếu trường bắt buộc '{f}'")
            for f in REQUIRED_FIELDS if not getattr(r, f)
        ]
    return blockers, unmapped_values(rows) + unmapped_subtask_statuses(rows) + progress_conflicts(rows, ref_date)

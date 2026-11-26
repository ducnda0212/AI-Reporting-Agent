from server.app.schemas.ingest import DiffSummary
from server.app.schemas.row import SOURCE_FIELDS, ReportRow


def compute_diff(
    prev_rows: list[ReportRow] | None, new_rows: list[ReportRow], overrides: dict[str, dict[str, str]]
) -> tuple[DiffSummary, list[ReportRow]]:
    """Compare Jira-sourced rows (`prev_rows` must be the previous *source* rows, before overrides).

    Overrides are re-applied on top of `new_rows`. A row is flagged `needs_review` when a field
    the user overrode changed at its Jira source since the previous upload.
    """
    prev = {r.ma: r for r in prev_rows or []}
    changed: set[str] = set()
    merged: list[ReportRow] = []
    for row in new_rows:
        old = prev.get(row.ma)
        diff_fields = {f for f in SOURCE_FIELDS if old is not None and getattr(old, f) != getattr(row, f)}
        if diff_fields:
            changed.add(row.ma)
        ovr = {f: v for f, v in overrides.get(row.ma, {}).items() if f in SOURCE_FIELDS}
        merged.append(row.model_copy(update={
            **ovr, "ovr": ovr, "needs_review": bool(diff_fields & ovr.keys()),
        }))
    new_codes = {r.ma for r in new_rows}
    summary = DiffSummary(
        has_previous_session=prev_rows is not None,
        added_projects=[r.ma for r in new_rows if r.ma not in prev] if prev_rows is not None else [],
        removed_projects=[c for c in prev if c not in new_codes],
        modified_count=len(changed),
    )
    return summary, merged

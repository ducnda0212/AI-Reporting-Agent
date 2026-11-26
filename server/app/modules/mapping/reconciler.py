"""Choice A: one row per main ticket (DA code in Summary); other issues are audit subtasks or orphans."""
from server.app.modules.mapping.resolved import resolve_mapping
from server.app.modules.mapping.rule_engine import issue_code, map_jira_issue_to_row
from server.app.schemas.ingest import OrphanIssue
from server.app.schemas.row import ReportRow, SubtaskAudit


def _ancestor(code: str, codes: set[str]) -> str | None:
    """I.C.1.2.1.1 -> I.C.1.2 (shortest dotted prefix that is a coded project in the file)."""
    parts = code.split(".")
    return next((p for n in range(2, len(parts)) if (p := ".".join(parts[:n])) in codes), None)


def _is_subtask(rec: dict) -> bool:
    return (rec.get("Issue Type") or "").strip().casefold() in ("subtask", "sub-task")


def reconcile_issues(
    records: list[dict], catalog: dict, week_boundaries: list[dict],
    mapping=None, assignments: dict[str, str] | None = None, ref_date=None,
) -> tuple[list[ReportRow], list[OrphanIssue]]:
    """`mapping`: MappingConfig/None for the rule engine. `assignments`: {orphan issue key: ma} manual re-link."""
    mapping = resolve_mapping(mapping)  # parse the config once, not per row
    by_key = {r.get("Issue key", ""): r for r in records}
    orphans: dict[str, OrphanIssue] = {}
    main_by_code: dict[str, dict] = {}  # ma -> main record
    owner_of: dict[str, str] = {}  # coded child key -> ma of its main row

    def orphan(rec: dict, reason: str) -> None:
        orphans[rec.get("Issue key", "")] = OrphanIssue(
            key=rec.get("Issue key", ""), summary=rec.get("Summary", ""),
            issue_type=rec.get("Issue Type", ""), status=rec.get("Status", ""), reason=reason,
        )

    coded = [(rec, code) for rec in records if (code := issue_code(rec, mapping)) is not None]
    uncoded = [rec for rec in records if issue_code(rec, mapping) is None]
    non_sub = {code for rec, code in coded if not _is_subtask(rec)}
    for rec, code in coded:  # non-subtasks first: a same-code Subtask must not take the project row
        if _is_subtask(rec):
            continue
        if root := _ancestor(code, non_sub):
            owner_of[rec["Issue key"]] = root
        elif code in main_by_code:
            orphan(rec, "DUPLICATE_DA_CODE")
        else:
            main_by_code[code] = rec
    for rec, code in coded:
        if not _is_subtask(rec):
            continue
        if code in main_by_code:
            orphan(rec, "DUPLICATE_DA_CODE")
        elif root := _ancestor(code, non_sub):
            owner_of[rec["Issue key"]] = root
        else:
            uncoded.append(rec)

    main_codes_by_key = {r["Issue key"]: c for c, r in main_by_code.items()}

    def owner(key: str) -> str | None:
        seen: set[str] = set()
        while key in by_key and key not in seen:
            seen.add(key)
            if key in main_codes_by_key:
                return main_codes_by_key[key]
            if key in owner_of:
                return owner_of[key]
            if key in orphans:
                return None
            key = by_key[key].get("Parent key", "")
        return None

    for rec in uncoded:
        if (code := owner(rec.get("Parent key", ""))) is not None:
            owner_of[rec["Issue key"]] = code
        else:
            orphan(rec, "NO_DA_CODE")

    rows: list[ReportRow] = []
    row_by_code: dict[str, ReportRow] = {}
    for rec in records:
        code = main_codes_by_key.get(rec.get("Issue key", ""))
        if code is not None:
            row = map_jira_issue_to_row(rec, catalog.get(code), week_boundaries, i=len(rows), mapping_config=mapping, ref_date=ref_date)
            row.isNew = code not in catalog
            rows.append(row)
            row_by_code[code] = row
    for rec in records:  # file order keeps subtask order stable
        key = rec.get("Issue key", "")
        if key in owner_of:
            row_by_code[owner_of[key]].subtasks.append(SubtaskAudit(
                key=key, summary=rec.get("Summary", ""), status=rec.get("Status", ""),
                assignee=rec.get("Assignee", ""),
            ))
    for rec in records:  # manual orphan -> project link (Recalculate); an unknown target leaves it an orphan
        key = rec.get("Issue key", "")
        if key in orphans and (target := row_by_code.get((assignments or {}).get(key, ""))) is not None:
            target.subtasks.append(SubtaskAudit(
                key=key, summary=rec.get("Summary", ""), status=rec.get("Status", ""), assignee=rec.get("Assignee", ""),
            ))
            del orphans[key]
    for row in rows:
        row.nChild = len(row.subtasks)
    return rows, [orphans[r.get("Issue key", "")] for r in records if r.get("Issue key", "") in orphans]

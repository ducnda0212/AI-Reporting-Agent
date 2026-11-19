"""Choice A: one row per main ticket (DA code in Summary); other issues are audit subtasks or orphans."""
from server.app.modules.mapping.rule_engine import extract_project_code_and_name, map_jira_issue_to_row
from server.app.schemas.ingest import OrphanIssue
from server.app.schemas.row import ReportRow, SubtaskAudit


def _catalog_ancestor(code: str, catalog: dict) -> str | None:
    """I.C.1.2.1 -> I.C.1.2 (longest dotted prefix present in the catalog)."""
    parts = code.split(".")
    for n in range(len(parts) - 1, 1, -1):
        if (prefix := ".".join(parts[:n])) in catalog:
            return prefix
    return None


def reconcile_issues(
    records: list[dict], catalog: dict, week_boundaries: list[dict]
) -> tuple[list[ReportRow], list[OrphanIssue]]:
    by_key = {r.get("Issue key", ""): r for r in records}
    orphans: dict[str, OrphanIssue] = {}
    main_by_code: dict[str, dict] = {}  # ma_da -> main record
    owner_of: dict[str, str] = {}  # coded child key -> ma_da of its main row

    def orphan(rec: dict, reason: str) -> None:
        orphans[rec.get("Issue key", "")] = OrphanIssue(
            key=rec.get("Issue key", ""), summary=rec.get("Summary", ""),
            issue_type=rec.get("Issue Type", ""), status=rec.get("Status", ""), reason=reason,
        )

    coded_children: list[tuple[dict, str]] = []
    uncoded: list[dict] = []
    for rec in records:
        code, _ = extract_project_code_and_name(rec.get("Summary", ""))
        if code is None:
            uncoded.append(rec)
        elif code in catalog:
            if code in main_by_code:
                orphan(rec, "DUPLICATE_DA_CODE")
            else:
                main_by_code[code] = rec
        else:
            coded_children.append((rec, code))

    for rec, code in coded_children:
        anc = _catalog_ancestor(code, catalog)
        if anc in main_by_code:
            owner_of[rec["Issue key"]] = anc
        else:
            orphan(rec, "CODE_NOT_IN_CATALOG")

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
            row = map_jira_issue_to_row(rec, catalog.get(code), week_boundaries, stt=len(rows) + 1)
            rows.append(row)
            row_by_code[code] = row
    for rec in records:  # file order keeps subtask order stable
        key = rec.get("Issue key", "")
        if key in owner_of:
            row_by_code[owner_of[key]].subtasks.append(SubtaskAudit(
                key=key, summary=rec.get("Summary", ""), status=rec.get("Status", ""),
                assignee=rec.get("Assignee", ""),
            ))
    return rows, [orphans[r.get("Issue key", "")] for r in records if r.get("Issue key", "") in orphans]

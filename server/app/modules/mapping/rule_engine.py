"""Jira issue -> 49-column ReportRow (sheet Dev_Mapping_chi_tiet), shaped like the client `Row`.

Columns N, T, U, X, Y, AB, AC, AD, AE, AH, AK (and most org columns) are manual / AI-suggested and stay empty
unless the mapping points them at a Jira column.
"""
import re
from datetime import date

from server.app.modules.mapping.normalizer import (
    PHASE_NAMES, normalize_phase, normalize_progress, normalize_status, parse_jira_date, phase_number,
)
from server.app.modules.mapping.resolved import MAPPABLE, resolve_mapping
from server.app.modules.mapping.wiki_parser import (
    parse_milestones, parse_progress_report, parse_risk_notes, progress_entries, sanitize_jira_markup,
)
from server.app.schemas.row import JiraPeople, ReportRow, WeekReportEntry

CODE_RE = re.compile(r"^\s*([IVX]+\.[A-Z0-9]+(?:\.[0-9]+)+)\s+(.*)$", re.S)
PHASE_COLUMNS = ("Custom field (AI Lifecycle)", "Custom field (Phase)")
DEV_COLUMNS = ("Custom field (Dev-BE)", "Custom field (Dev-FE)", "Custom field (Developer)", "Custom field (Developers)")
PRD_COLUMN = re.compile(r"Custom field \(PRD( \(URL\))?\)(_\d+)?")
URL_RE = re.compile(r"https?://[^\s\]|)]+")
LABELS_COLUMN = re.compile(r"Labels(_\d+)?")
DATE_FIELDS = ("start", "end")


def extract_project_code_and_name(summary: str) -> tuple[str | None, str]:
    m = CODE_RE.match(summary or "")
    return (m.group(1), m.group(2).strip()) if m else (None, (summary or "").strip())


def _get(issue: dict, *cols: str) -> str:
    return next((str(issue[c]).strip() for c in cols if issue.get(c) and str(issue[c]).strip()), "")


def _fmt(d: date | None) -> str:
    return f"{d:%d/%m/%Y}" if d else ""


def _kpi(text: str) -> str:
    """KPI wiki table `|STT|KPI|...|` -> one "STT. KPI" line per row; plain text is just cleaned."""
    if not text.lstrip().startswith("||"):
        return sanitize_jira_markup(text)
    lines = []
    for line in text.split("\n"):
        if line.startswith("||") or not line.startswith("|"):
            continue
        c = [sanitize_jira_markup(x) for x in line.strip().strip("|").split("|")]
        if len(c) >= 2 and c[1]:
            lines.append(f"{c[0]}. {c[1]}")
    return "\n".join(lines)


def _goal(issue: dict) -> str:
    """Rule D: Description before MILESTONES? (lines joined by spaces) -> Goals -> Business Goal."""
    desc = issue.get("Description") or ""
    if re.search(r"MILESTONES?", desc, re.I):
        goal = " ".join(line.strip() for line in parse_milestones(desc)[0].splitlines() if line.strip())
        if goal:
            return goal
    return _get(issue, "Custom field (Goals)", "Custom field (Business Goal)")


def _developers(issue: dict) -> str:
    names: list[str] = []
    for col in DEV_COLUMNS:
        names += [n.strip() for n in (issue.get(col) or "").split(",") if n.strip()]
    return "\n".join(dict.fromkeys(names))


def _prd_link(issue: dict) -> str:
    cols = sorted((c for c in issue if PRD_COLUMN.fullmatch(c)), key=lambda c: "(URL)" in c)  # PRD first, then PRD (URL)
    for col in cols:
        if m := URL_RE.search(issue.get(col) or ""):
            return m.group(0)
    return ""


def _tt1(status: str, progress: str, due: date | None, ref: date | None) -> str:
    """TRẠNG THÁI 1 (AA): status combined with timing (Due date vs the report date) and Tiến độ."""
    if not status:
        return ""
    if status in ("Hủy", "Tạm dừng"):
        return status
    late = progress == "Chậm tiến độ"
    overdue = bool(due and ref and due < ref)
    if status == "Chưa thực hiện":
        return "Chưa thực hiện Chậm tiến độ" if overdue else "Trong kế hoạch"
    if status == "Đã hoàn thành":
        return "Đã hoàn thành " + ("Chậm tiến độ" if late else "Đúng tiến độ")
    late = late or overdue
    if not late and not progress:
        return ""
    return "Đang thực hiện " + ("Chậm tiến độ" if late else "Đúng tiến độ")


def _stages(step: int) -> list[str]:
    return ["done" if k < step - 2 else "doing" if k < step else "todo" for k in range(12)]


def _clean(fid: str, text: str, mp) -> str:
    """Value of a column read straight from the Jira column the mapping points at."""
    if fid in DATE_FIELDS:
        return _fmt(parse_jira_date(text))
    if fid == "tt":
        return normalize_status(text, mp.status)
    if fid == "td":
        return normalize_progress(text, mp.progress)
    if fid == "buoc":
        return normalize_phase(text, mp.phase, mp.bucket)
    if fid == "buocso":
        return f"Bước {n}" if (n := phase_number(text, mp.bucket)) else ""
    if fid == "kpi":
        return _kpi(text)
    if fid in ("muctieu", "milestone", "output"):
        return sanitize_jira_markup(text)
    return text


def map_jira_issue_to_row(
    issue: dict, catalog_entry: dict | None, week_boundaries: list[dict], i: int, mapping_config=None,
    ref_date: date | None = None,
) -> ReportRow:
    """`mapping_config`: MappingConfig / ResolvedMapping / None (= the Phase-1 PMO defaults)."""
    mp = resolve_mapping(mapping_config)
    src = mp.cols
    ma, viec = extract_project_code_and_name(issue.get("Summary", ""))
    ma = ma or ""
    _, milestone = parse_milestones(issue.get("Description"))
    if not re.search(r"MILESTONES?", issue.get("Description") or "", re.I):
        milestone = ""

    raw_phase = _get(issue, *src("buocso", PHASE_COLUMNS))
    step = phase_number(raw_phase, mp.bucket)
    due = parse_jira_date(_get(issue, *src("end", ("Due date",))))
    status = normalize_status(_get(issue, *src("tt", ("Status", "Status category"))), mp.status)
    progress = normalize_progress(_get(issue, *src("td", ("Custom field (Progress)",))), mp.progress)

    weekly = parse_progress_report(issue.get("Custom field (Progress Report)"), week_boundaries)
    risks = parse_risk_notes(issue.get("Custom field (Risk Notes)"), week_boundaries)
    blocks: dict[str, str] = {}
    for w in (1, 2, 3, 4):
        p = weekly.get(w, {})
        blocks[f"w{w}ht" if w != 3 else "ht"] = p.get("completed", "")
        blocks[f"w{w}kh" if w != 3 else "kh"] = p.get("plan", "")
        blocks[f"w{w}vd" if w != 3 else "vd"] = "\n".join(x for x in (p.get("blockers", ""), risks.get(w, "")) if x)

    entries = progress_entries(issue.get("Custom field (Progress Report)"), week_boundaries)
    pr = [WeekReportEntry(date=e["date"], done=e["done"], plan=e["plan"]) for e in sorted(entries, key=lambda e: e["date"])]
    prw = {f"w{e['week']}": WeekReportEntry(date=e["date"], done=e["done"], plan=e["plan"])
           for e in sorted(entries, key=lambda e: e["date"]) if e["week"] in (1, 2, 3, 4)}

    v: dict[str, str] = {
        "mang": (catalog_entry or {}).get("mang_viec") or (ma.rsplit(".", 1)[0] if ma else ""),
        "ma": ma, "viec": viec, "muctieu": _goal(issue),
        "kpi": _kpi(_get(issue, *src("kpi", ("Custom field (KPI/Outcome)",)))),
        "pic": _get(issue, *src("pic", ("Assignee", "Custom field (PO)", "Custom field (Tech lead)"))),
        "start": _fmt(parse_jira_date(_get(issue, *src("start", ("Custom field (Start date)",))))),
        "end": _fmt(due), "tt": status, "td": progress, "milestone": milestone,
        "buocso": f"Bước {step}" if step else "",
        "buoc": normalize_phase(raw_phase, mp.phase, mp.bucket),
        "gdk": _get(issue, *src("gdk", ("Custom field (Board of Management)", "Custom field (Team Name)"))),
        "phong": _get(issue, *src("phong", ("Custom field (Department)",))),
        "bo": _get(issue, *src("bo", ("Custom field (Business Owner)",))),
        "po": _get(issue, *src("po", ("Custom field (PO)", "Custom field (Product manager)"))),
        "swe": _developers(issue),
        "prio": _get(issue, *src("prio", ("Priority", "Custom field (Priority)"))),
        "tt1": _tt1(status, progress, due, ref_date),
        "loai": "KHHĐ 2026", "link": _prd_link(issue),
        "market": "VN",  # shortcut: sheet says copy Location/Department verbatim (flagged "gợi ý"); plan pins VN
        **blocks,
    }
    # A column the mapping points at a Jira column takes that column's cleaned text over the built-in parser.
    for fid, cols in mp.sources.items():
        if fid in MAPPABLE:
            v[fid] = _clean(fid, _get(issue, *cols), mp)

    poff = _get(issue, "Custom field (PO)")
    return ReportRow(
        i=i, key=issue.get("Issue key", ""), g=ma.rsplit(".", 1)[0] if ma else "",
        tplRow=(catalog_entry or {}).get("template_row") or 0,
        rawStatus=_get(issue, "Status"), rawProgress=_get(issue, "Custom field (Progress)"), rawPhase=raw_phase,
        labels=", ".join(val.strip() for k, val in issue.items() if LABELS_COLUMN.fullmatch(k) and (val or "").strip()),
        jira=JiraPeople(pic=_get(issue, "Assignee"), po=poff, gdk=_get(issue, "Custom field (Team Name)")),
        tl=_get(issue, "Custom field (Tech lead)"), poField=poff,
        pr=pr, prw=prw, comment=sanitize_jira_markup(_get(issue, "Custom field (Comments)", "Comment")),
        updated=_fmt(parse_jira_date(issue.get("Updated"))),
        done=step, total=len(PHASE_NAMES), stages=_stages(step), **v,
    )

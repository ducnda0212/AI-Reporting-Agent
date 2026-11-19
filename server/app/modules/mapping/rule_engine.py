"""Jira issue -> 49-column ReportRow (sheet Dev_Mapping_chi_tiet).

Columns M, N, T, U, V, X, Y, AB, AC, AD, AE, AH, AK are manual / AI-suggested and stay empty here.
"""
import re

from server.app.modules.mapping.normalizer import (
    normalize_phase, normalize_progress, normalize_status, parse_jira_date,
)
from server.app.modules.mapping.wiki_parser import (
    parse_milestones, parse_progress_report, parse_risk_notes, sanitize_jira_markup,
)
from server.app.schemas.row import ReportRow

CODE_RE = re.compile(r"^\s*([IVX]+\.[A-Z0-9]+(?:\.[0-9]+)+)\s+(.*)$", re.S)
PHASE_COLUMNS = ("Custom field (AI Lifecycle)", "Custom field (Phase)")
DEV_COLUMNS = ("Custom field (Dev-BE)", "Custom field (Dev-FE)", "Custom field (Developer)", "Custom field (Developers)")
PRD_COLUMN = re.compile(r"Custom field \(PRD( \(URL\))?\)(_\d+)?")
URL_RE = re.compile(r"https?://[^\s\]|)]+")


def extract_project_code_and_name(summary: str) -> tuple[str | None, str]:
    m = CODE_RE.match(summary or "")
    return (m.group(1), m.group(2).strip()) if m else (None, (summary or "").strip())


def _get(issue: dict, *cols: str) -> str:
    return next((str(issue[c]).strip() for c in cols if issue.get(c) and str(issue[c]).strip()), "")


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


def map_jira_issue_to_row(issue: dict, catalog_entry: dict | None, week_boundaries: list[dict], stt: int) -> ReportRow:
    ma_da, cong_viec = extract_project_code_and_name(issue.get("Summary", ""))
    _, milestone = parse_milestones(issue.get("Description"))
    if not re.search(r"MILESTONES?", issue.get("Description") or "", re.I):
        milestone = ""

    status = normalize_status(issue.get("Status")) or normalize_status(issue.get("Status category"))
    progress = normalize_progress(issue.get("Custom field (Progress)"))
    phase = normalize_phase(_get(issue, *PHASE_COLUMNS))

    weekly = parse_progress_report(issue.get("Custom field (Progress Report)"), week_boundaries)
    risks = parse_risk_notes(issue.get("Custom field (Risk Notes)"), week_boundaries)
    blocks: dict[str, str] = {}
    for w in (1, 2, 3, 4):
        p = weekly.get(w, {})
        blocks[f"hoan_thanh_w{w}"] = p.get("completed", "")
        blocks[f"ke_hoach_w{w}"] = p.get("plan", "")
        blocks[f"van_de_w{w}"] = "\n".join(x for x in (p.get("blockers", ""), risks.get(w, "")) if x)

    return ReportRow(
        stt=stt,
        issue_key=issue.get("Issue key", ""),
        mang_viec=(catalog_entry or {}).get("mang_viec") or (ma_da.rsplit(".", 1)[0] if ma_da else ""),
        ma_da=ma_da or "",
        cong_viec=cong_viec,
        muc_tieu=_goal(issue),
        kpi=_kpi(issue.get("Custom field (KPI/Outcome)") or ""),
        pic=_get(issue, "Assignee", "Custom field (PO)", "Custom field (Tech lead)"),
        bat_dau=parse_jira_date(issue.get("Custom field (Start date)")),
        ket_thuc=parse_jira_date(issue.get("Due date")),
        trang_thai=status,
        tien_do=progress,
        milestone=milestone,
        ai_lifecycle_phase=phase,
        ai_lifecycle=phase,
        gdk_qltt=_get(issue, "Custom field (Board of Management)"),
        phong=_get(issue, "Custom field (Department)"),
        business_owner=_get(issue, "Custom field (Business Owner)"),
        product_owner=_get(issue, "Custom field (PO)", "Custom field (Product manager)"),
        software_engineer=_developers(issue),
        priority=_get(issue, "Priority", "Custom field (Priority)"),
        trang_thai_1=f"{status} {progress}".strip(),
        loai_du_an="KHHĐ 2026",
        link_confluence=_prd_link(issue),
        market="VN",  # shortcut: sheet says copy Location/Department verbatim (flagged "gợi ý"); plan pins VN
        **blocks,
    )

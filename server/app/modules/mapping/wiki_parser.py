"""Jira wiki markup: sanitizing, Progress Report / Risk Notes tables, milestones."""
import re
from datetime import date

_PIPE = "\x00"  # stands in for a '|' inside [title|url] so it is not read as a cell border
_DATE_ROW = re.compile(r"\|\{\{(\d{4}-\d{2}-\d{2})\}\}\|")
_BLOCKER = re.compile(r"(?:^|\n)[ \t]*(?:#[ \t]*)?\*?(?:Blockers?|Risks?)[ \t]*:\*?", re.I)
_PROGRESS_PART = re.compile(r"(?im)^[ 	]*(?:#[ 	]*)?\*?Tiến độ[ 	]*:\*?")
_MILESTONE = re.compile(r"MILESTONES?[ \t]*:?", re.I)
_TAGS = re.compile(r"\{(?:color(?::[^}]*)?|panel(?::[^}]*)?|code(?::[^}]*)?|noformat)\}")
_LINK = re.compile(r"\[([^\[\]|]*)\|([^\[\]]*)\]")


def _protect_links(text: str) -> str:
    return re.sub(r"\[[^\[\]]*\]", lambda m: m.group(0).replace("|", _PIPE), text)


def _link(m: re.Match) -> str:
    title, target = m.group(1).strip(), m.group(2).strip()
    if target.lower() == "smart-link" or not title:
        return title or target
    return title


def sanitize_jira_markup(text: str | None) -> str:
    if not text:
        return ""
    t = text.replace("\r\n", "\n").replace("\r", "\n").replace(_PIPE, "|")
    t = re.sub(r"ApprovalsCFValue\{[^}]*\}", "", t)
    t = _TAGS.sub("", t)
    t = _LINK.sub(_link, t)
    t = re.sub(r"\[([A-Z][A-Z0-9]*-\d+)\]", r"\1", t)
    t = re.sub(r"\{\{([^}]*)\}\}", r"\1", t)
    t = re.sub(r"\*(\S(?:[^*\n]*\S)?)\*", r"\1", t)  # bold; "* item" bullets are untouched
    t = re.sub(r"(?m)^[ \t]*[#*][ \t]+", "- ", t)
    return "\n".join(line.rstrip() for line in t.split("\n")).strip()


def _week_of(d: date, weeks: list[dict]) -> int | None:
    return next((w["week"] for w in weeks if w["start"] <= d <= w["end"]), None)


def parse_progress_report(wiki_table_str: str | None, week_boundaries: list[dict]) -> dict[int, dict[str, str]]:
    if not wiki_table_str:
        return {}
    parts = _DATE_ROW.split(_protect_links(wiki_table_str.replace("\r\n", "\n")))
    buckets: dict[int, dict[str, list[str]]] = {}
    for iso, body in zip(parts[1::2], parts[2::2]):
        wk = _week_of(date.fromisoformat(iso), week_boundaries)
        if wk is None:
            continue
        cells = body.strip().rstrip("|").split("|")
        main, plan = cells[0], "\n".join(cells[1:])  # extra pipes (corrupt cells) stay in the plan
        m = _BLOCKER.search(main)
        completed, blockers = (main[: m.start()], main[m.end():]) if m else (main, "")
        if p := _PROGRESS_PART.search(completed):  # rule AL: prefer the part after "Tiến độ:"
            completed = completed[p.end():]
        b = buckets.setdefault(wk, {"completed": [], "plan": [], "blockers": []})
        for key, val in (("completed", completed), ("plan", plan), ("blockers", blockers)):
            val = sanitize_jira_markup(val)
            if val:
                b[key].append(f"[{iso}] {val}")
    return {wk: {k: "\n".join(v) for k, v in b.items()} for wk, b in sorted(buckets.items())}


def parse_risk_notes(wiki_table_str: str | None, week_boundaries: list[dict]) -> dict[int, str]:
    """Risk Notes rows `|STT|Date|Mô tả|Todo|PIC|Deadline|` grouped by report week."""
    out: dict[int, list[str]] = {}
    for line in _protect_links(wiki_table_str or "").split("\n"):
        if not line.startswith("|") or line.startswith("||"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", cells[1]):
            continue
        wk = _week_of(date.fromisoformat(cells[1]), week_boundaries)
        if wk is None:
            continue
        desc = sanitize_jira_markup(cells[2])
        todo = sanitize_jira_markup(cells[3]) if len(cells) > 3 else ""
        out.setdefault(wk, []).append(f"{desc} (Đề xuất: {todo})" if todo else desc)
    return {wk: "\n".join(v) for wk, v in sorted(out.items())}


def parse_milestones(description_str: str | None) -> tuple[str, str]:
    """Return (goal, milestone_text): goal precedes `MILESTONE(S):`, milestones follow it."""
    desc = (description_str or "").replace("\r\n", "\n")
    m = _MILESTONE.search(desc)
    if not m:
        return sanitize_jira_markup(desc), ""
    goal = re.sub(r"\n?[ \t]*\d+\.[ \t]*$", "", desc[: m.start()].rstrip())  # drop heading number "4."
    return sanitize_jira_markup(goal), sanitize_jira_markup(desc[m.end():])

import calendar
import re
from datetime import date

from server.app.schemas.cycle import ActiveCycle, ActiveWeek

_CYCLE = re.compile(r"(\d{4})_(0[1-9]|1[0-2])(?:_w([1-4]))?")

# PMO-approved boundaries (sheet 3_Quy_doi_gia_tri): November starts on 31/10 and W4 ends 30/11.
_OVERRIDES = {
    (2026, 11): [(date(2026, 10, 31), date(2026, 11, 6)), (date(2026, 11, 7), date(2026, 11, 14)),
                 (date(2026, 11, 15), date(2026, 11, 22)), (date(2026, 11, 23), date(2026, 11, 30))],
}


def _parse(cycle_id: str) -> tuple[int, int, int | None]:
    m = _CYCLE.fullmatch(cycle_id or "")
    if not m:
        raise ValueError(f"invalid cycle_id: {cycle_id!r}")
    return int(m[1]), int(m[2]), int(m[3]) if m[3] else None


def weeks_for_cycle(cycle_id: str) -> list[dict]:
    """4 week blocks (AL..AW) of a monthly cycle; days 29+ fold into W4 so no day is lost."""
    year, month, _ = _parse(cycle_id)
    spans = _OVERRIDES.get((year, month))
    if spans is None:
        last = calendar.monthrange(year, month)[1]
        spans = [(date(year, month, 1), date(year, month, 7)), (date(year, month, 8), date(year, month, 14)),
                 (date(year, month, 15), date(year, month, 21)), (date(year, month, 22), date(year, month, last))]
    return [{"week": i, "start": s, "end": e} for i, (s, e) in enumerate(spans, 1)]


def reference_date(cycle_id: str) -> date:
    """'Today' of the reporting cycle: end of the named week (…_w3), else end of the month."""
    weeks = weeks_for_cycle(cycle_id)
    n = _parse(cycle_id)[2] or len(weeks)
    return weeks[n - 1]["end"]


def _range(w: dict) -> str:
    s, e = w["start"], w["end"]
    return f"{s:%d}–{e:%d/%m}" if s.month == e.month else f"{s:%d/%m}–{e:%d/%m}"


def week_name(cycle_id: str, week: dict) -> str:
    return f"Tuần {week['week']:02d}/{_parse(cycle_id)[1]:02d} · {_range(week)}"


def current_week(cycle_id: str) -> int:
    return _parse(cycle_id)[2] or len(weeks_for_cycle(cycle_id))


def active_cycle(cycle_id: str) -> ActiveCycle:
    cur = current_week(cycle_id)
    return ActiveCycle(
        cycle_id=cycle_id, current_wk=f"w{cur}", today=reference_date(cycle_id),
        weeks=[ActiveWeek(k=f"w{w['week']}", name=week_name(cycle_id, w), range=_range(w), cur=w["week"] == cur,
                          future=w["week"] > cur, start=w["start"], end=w["end"]) for w in weeks_for_cycle(cycle_id)],
    )

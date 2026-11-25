import calendar
import re
from datetime import date

from server.app.schemas.cycle import ActiveCycle, ActiveWeek

_CYCLE = re.compile(r"(\d{4})_(0[1-9]|1[0-2])(?:_w([1-4]))?")

def _parse(cycle_id: str) -> tuple[int, int, int | None]:
    m = _CYCLE.fullmatch(cycle_id or "")
    if not m:
        raise ValueError(f"invalid cycle_id: {cycle_id!r}")
    return int(m[1]), int(m[2]), int(m[3]) if m[3] else None


def weeks_for_cycle(cycle_id: str) -> list[dict]:
    """4 PMO week blocks of a month: W1 opens on the 31st of a 31-day previous month (else the 1st) and ends on
    the 6th; W2 7-14, W3 15-22, W4 23-30 (or month end). The 31st of a 31-day month opens next month's W1."""
    year, month, _ = _parse(cycle_id)
    py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
    start = date(py, pm, 31) if calendar.monthrange(py, pm)[1] == 31 else date(year, month, 1)
    last = min(30, calendar.monthrange(year, month)[1])
    spans = [(start, date(year, month, 6)), (date(year, month, 7), date(year, month, 14)),
             (date(year, month, 15), date(year, month, 22)), (date(year, month, 23), date(year, month, last))]
    return [{"week": i, "start": s, "end": e} for i, (s, e) in enumerate(spans, 1)]


def cycle_for_date(d: date) -> str:
    """The `YYYY_MM_wN` whose week contains `d` (the 31st can belong to next month's W1)."""
    for year, month in ((d.year, d.month), (d.year + (d.month == 12), d.month % 12 + 1)):
        for w in weeks_for_cycle(f"{year}_{month:02d}"):
            if w["start"] <= d <= w["end"]:
                return f"{year}_{month:02d}_w{w['week']}"
    raise ValueError(f"no week for {d}")  # unreachable: the rule covers every day


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


def active_cycle(cycle_id: str, today: date | None = None) -> ActiveCycle:
    cur = current_week(cycle_id)
    return ActiveCycle(
        cycle_id=cycle_id, current_wk=f"w{cur}", today=today or reference_date(cycle_id),
        weeks=[ActiveWeek(k=f"w{w['week']}", name=week_name(cycle_id, w), range=_range(w), cur=w["week"] == cur,
                          future=w["week"] > cur, start=w["start"], end=w["end"]) for w in weeks_for_cycle(cycle_id)],
    )

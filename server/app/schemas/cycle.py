from datetime import date

from server.app.schemas.common import ApiModel


class WeekBoundary(ApiModel):
    week: int
    start: date
    end: date


class CycleSchema(ApiModel):
    id: str
    year: int
    month: int
    weeks: list[WeekBoundary]


class ActiveWeek(ApiModel):
    k: str  # w1..w4
    name: str
    range: str
    cur: bool
    future: bool
    start: date
    end: date


class ActiveCycle(ApiModel):
    cycle_id: str
    current_wk: str
    today: date
    weeks: list[ActiveWeek]

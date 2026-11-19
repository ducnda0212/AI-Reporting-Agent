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

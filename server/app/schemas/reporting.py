from typing import Literal

from pydantic import Field

from server.app.schemas.common import ApiModel

WeekKey = Literal["w1", "w2", "w3", "w4"]


class VerEditEntry(ApiModel):
    t: str = ""
    day: str = ""
    a: str = ""
    o: str = ""
    d: str = ""


class VersionStats(ApiModel):
    rows: int = 0
    hand: int = 0
    ai: int = 0


class LockReportRequest(ApiModel):
    session_id: str
    cycle_id: str
    wk: WeekKey
    by: str
    note: str = ""
    file_name: str = ""
    snap: dict[str, str | None] = Field(default_factory=dict)  # "ma|field" -> value
    raw_notes: dict[str, str] = Field(default_factory=dict)  # ma -> note without the manual-edit suffix
    fmt: dict[str, dict] = Field(default_factory=dict)
    wrap: dict[str, bool] = Field(default_factory=dict)
    hidden: dict[str, bool] = Field(default_factory=dict)
    stats: VersionStats | None = None
    edits: list[VerEditEntry] | None = None  # None = derive from the session draft's audit log
    log_seq: int = 0


class ExportExcelRequest(ApiModel):
    version_id: str
    file_name: str = ""
    ex_cols: Literal["vis", "all"] = "vis"
    hidden: dict[str, bool] | None = None  # None = the hidden columns saved with the version
    only_current_week: bool = True
    append_override_note: bool = True


class VersionOut(ApiModel):
    """Client `VersionItem`."""
    id: str
    session_id: str
    cycle_id: str
    wk: WeekKey
    v: int
    by: str
    at: str
    note: str = ""
    exported: str | None = None
    fileName: str = ""
    mine: bool = True
    stats: VersionStats = Field(default_factory=VersionStats)
    changes: list[list[str | None]] = Field(default_factory=list)
    snap: dict[str, str | None] = Field(default_factory=dict)
    fmt: dict[str, dict] = Field(default_factory=dict)
    wrap: dict[str, bool] = Field(default_factory=dict)
    hidden: dict[str, bool] = Field(default_factory=dict)
    edits: list[VerEditEntry] = Field(default_factory=list)

from pydantic import Field

from server.app.schemas.common import ApiModel

# Template column letter -> ReportRow field (A..AW, sheet "Mẫu báo cáo"). Ids are the client FieldIds;
# week 3 (the working week) is ht/kh/vd, X is the untitled spacer.
COLUMN_FIELDS: dict[str, str] = {
    "A": "mang", "B": "ma", "C": "viec", "D": "muctieu", "E": "kpi", "F": "pic",
    "G": "start", "H": "end", "I": "tt", "J": "td", "K": "milestone",
    "L": "buocso", "M": "output", "N": "note", "O": "gdk", "P": "phong",
    "Q": "tp", "R": "bo", "S": "po", "T": "aieng",
    "U": "airs", "V": "mlops", "W": "swe", "X": "x",
    "Y": "caitien", "Z": "prio", "AA": "tt1", "AB": "giatri",
    "AC": "rui", "AD": "action", "AE": "nextstep", "AF": "loai",
    "AG": "link", "AH": "domain", "AI": "market", "AJ": "buoc",
    "AK": "uoctinh",
    "AL": "w1ht", "AM": "w1kh", "AN": "w1vd",
    "AO": "w2ht", "AP": "w2kh", "AQ": "w2vd",
    "AR": "ht", "AS": "kh", "AT": "vd",
    "AU": "w4ht", "AV": "w4kh", "AW": "w4vd",
}
# Jira-sourced values: what a diff compares and what a manual override may target.
SOURCE_FIELDS: frozenset[str] = frozenset(COLUMN_FIELDS.values()) - {"x"}
WEEK_TEXT: dict[str, tuple[str, str, str, str]] = {  # kind -> field of week 1..4
    "done": ("w1ht", "w2ht", "ht", "w4ht"),
    "plan": ("w1kh", "w2kh", "kh", "w4kh"),
    "issues": ("w1vd", "w2vd", "vd", "w4vd"),
}


class SubtaskAudit(ApiModel):
    key: str
    summary: str = ""
    status: str = ""
    assignee: str = ""


class WeekReportEntry(ApiModel):
    date: str = ""  # ISO yyyy-mm-dd
    done: str = ""
    plan: str = ""


class JiraPeople(ApiModel):
    pic: str = ""
    po: str = ""
    gdk: str = ""


class ReportRow(ApiModel):
    """One project row, shaped like the client `Row` (client/src/types). Dates are dd/mm/yyyy."""
    i: int = 0
    key: str = ""
    g: str = ""
    real: bool = True
    dup: bool = False
    isNew: bool = False
    tplRow: int = 0
    rawStatus: str = ""
    rawProgress: str = ""
    rawPhase: str = ""
    labels: str = ""
    jira: JiraPeople = Field(default_factory=JiraPeople)
    tl: str = ""
    poField: str = ""
    idOnly: bool = False
    # A..W
    mang: str = ""
    ma: str = ""
    viec: str = ""
    muctieu: str = ""
    kpi: str = ""
    pic: str = ""
    start: str = ""
    end: str = ""
    tt: str = ""
    td: str = ""
    milestone: str = ""
    buocso: str = ""
    output: str = ""
    note: str = ""
    gdk: str = ""
    phong: str = ""
    tp: str = ""
    bo: str = ""
    po: str = ""
    aieng: str = ""
    airs: str = ""
    mlops: str = ""
    swe: str = ""
    # Y..AK
    caitien: str = ""
    prio: str = ""
    tt1: str = ""
    giatri: str = ""
    rui: str = ""
    action: str = ""
    nextstep: str = ""
    loai: str = ""
    link: str = ""
    domain: str = ""
    market: str = ""
    buoc: str = ""
    uoctinh: str = ""
    # AL..AW (4 weeks x done/plan/issues); week 3 = ht/kh/vd
    w1ht: str = ""
    w1kh: str = ""
    w1vd: str = ""
    w2ht: str = ""
    w2kh: str = ""
    w2vd: str = ""
    ht: str = ""
    kh: str = ""
    vd: str = ""
    w4ht: str = ""
    w4kh: str = ""
    w4vd: str = ""
    # report data and progress
    pr: list[WeekReportEntry] = Field(default_factory=list)
    prw: dict[str, WeekReportEntry] = Field(default_factory=dict)
    comment: str = ""
    updated: str = ""
    tags: list[str] = Field(default_factory=list)
    done: int = 0  # AI lifecycle step 1..12 (0 = unknown)
    total: int = 12
    stages: list[str] = Field(default_factory=list)  # 12 x done|doing|todo
    reasons: dict[str, str] = Field(default_factory=dict)
    ai: dict[str, dict] = Field(default_factory=dict)  # filled by the AI stage
    nChild: int = 0
    priority: str = ""
    # audit / state
    subtasks: list[SubtaskAudit] = Field(default_factory=list)
    ovr: dict[str, str] = Field(default_factory=dict)
    needs_review: bool = False

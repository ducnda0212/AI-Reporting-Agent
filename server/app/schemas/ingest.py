from pydantic import Field

from server.app.schemas.common import ApiModel
from server.app.schemas.row import ReportRow


class OrphanIssue(ApiModel):
    key: str
    summary: str = ""
    issue_type: str = ""
    status: str = ""
    reason: str  # NO_DA_CODE | CODE_NOT_IN_CATALOG


class BlockerIssue(ApiModel):
    code: str
    message: str
    key: str = ""
    field: str = ""


class WarningIssue(ApiModel):
    code: str
    message: str
    key: str = ""
    field: str = ""


class FileStats(ApiModel):
    total_rows: int
    total_cols: int
    skipped_empty_rows: int = 0
    matched_projects: int = 0
    dup_groups: int = 0
    dup_cols: int = 0
    used_cols: int = 0


class GroupInfo(ApiModel):
    k: str
    name: str


class AppliedMappingInfo(ApiModel):
    id: str = ""
    name: str = ""
    matched_cols: int = 0
    total_cols: int = 0


class DiffSummary(ApiModel):
    has_previous_session: bool = False
    added_projects: list[str] = Field(default_factory=list)
    removed_projects: list[str] = Field(default_factory=list)
    modified_count: int = 0
    schema_changes: list[str] = Field(default_factory=list)


class IngestResponse(ApiModel):
    success: bool
    session_id: str
    file_name: str  # required: a response stored before this field existed no longer validates (stale session)
    is_duplicate_file: bool = False
    file_stats: FileStats
    file_cols: list[str] = Field(default_factory=list)
    groups: list[GroupInfo] = Field(default_factory=list)
    applied_mapping: AppliedMappingInfo = Field(default_factory=AppliedMappingInfo)
    diff_summary: DiffSummary
    rows: list[ReportRow] = Field(default_factory=list)
    orphans: list[OrphanIssue] = Field(default_factory=list)
    blockers: list[BlockerIssue] = Field(default_factory=list)
    warnings: list[WarningIssue] = Field(default_factory=list)


class ImportFileMeta(ApiModel):
    """One entry of "Lần nhập gần nhất"."""
    session_id: str
    name: str
    wk: str
    at: str
    by: str
    issues: int
    cols: int
    prj: int
    ver: str = ""

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


class DiffSummary(ApiModel):
    has_previous_session: bool = False
    added_projects: list[str] = Field(default_factory=list)
    removed_projects: list[str] = Field(default_factory=list)
    modified_count: int = 0
    schema_changes: list[str] = Field(default_factory=list)


class IngestResponse(ApiModel):
    success: bool
    session_id: str
    is_duplicate_file: bool = False
    file_stats: FileStats
    diff_summary: DiffSummary
    rows: list[ReportRow] = Field(default_factory=list)
    orphans: list[OrphanIssue] = Field(default_factory=list)
    blockers: list[BlockerIssue] = Field(default_factory=list)
    warnings: list[WarningIssue] = Field(default_factory=list)

from datetime import datetime
from typing import Literal

from pydantic import Field

from server.app.schemas.common import ApiModel
from server.app.schemas.row import ReportRow


class MappingColumnDef(ApiModel):
    field_id: str
    col_letter: str
    name: str
    source_type: Literal["jira", "derived", "constant", "manual"]
    source_field: str = ""
    fallbacks: list[str] = Field(default_factory=list)
    required: bool = False


class ValueMappings(ApiModel):
    status_map: dict[str, str] = Field(default_factory=dict)
    progress_map: dict[str, str] = Field(default_factory=dict)
    phase_map: dict[str, str] = Field(default_factory=dict)
    phase_bucket: dict[str, int] = Field(default_factory=dict)  # raw Jira phase -> AI lifecycle step 1..12


class MappingConfigCreate(ApiModel):
    name: str
    description: str | None = None
    columns: list[MappingColumnDef]
    value_mappings: ValueMappings


class MappingConfigUpdate(ApiModel):
    """Partial update: omitted fields keep their value."""
    name: str | None = None
    description: str | None = None
    columns: list[MappingColumnDef] | None = None
    value_mappings: ValueMappings | None = None


class MappingConfigOut(ApiModel):
    id: str
    name: str
    description: str | None = None
    is_default: bool
    status: str
    version: int
    columns: list[MappingColumnDef]
    value_mappings: ValueMappings
    created_at: datetime
    updated_at: datetime
    created_by: str


class CloneRequest(ApiModel):
    new_name: str | None = None


class OrphanAssignment(ApiModel):
    key: str
    target_ma_da: str


class RecalculateRequest(ApiModel):
    session_id: str
    mapping_id: str | None = None  # None = system default mapping
    orphan_assignments: list[OrphanAssignment] = Field(default_factory=list)
    overrides: dict[str, dict[str, str]] = Field(default_factory=dict)  # {ma: {field: value}}
    src_overrides: dict[str, str] = Field(default_factory=dict)  # {field_id: Jira column} unsaved preview
    value_mappings: ValueMappings | None = None  # unsaved inline status/progress/phase maps


class AuditLogEntry(ApiModel):
    """Client `LogEntry`: t = HH:MM, day = dd/mm/yyyy, a = action, o = object, d = detail, r = result."""
    t: str = ""
    day: str = ""
    seq: int = 0
    a: str = ""
    o: str = ""
    d: str = ""
    r: str = ""


class SessionDraftState(ApiModel):
    """Working state shared by the save request and the stored draft."""
    session_id: str
    cycle_id: str
    mapping_id: str | None = None
    rows: list[ReportRow]
    overrides: dict[str, dict[str, str]] = Field(default_factory=dict)
    fmt: dict[str, dict] = Field(default_factory=dict)
    wrap: dict[str, bool] = Field(default_factory=dict)
    touched: dict[str, int] = Field(default_factory=dict)
    hidden: dict[str, bool] = Field(default_factory=dict)
    pin_viec: bool = True
    ex_cols: Literal["vis", "all"] = "vis"
    lock_by: str = "Khuê"
    log_seq: int = 0
    lock_seq: int = 0
    audit_logs: list[AuditLogEntry] = Field(default_factory=list)


class SessionDraftSaveRequest(SessionDraftState):
    pass


class SessionDraftOut(SessionDraftState):
    updated_at: datetime

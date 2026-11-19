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
    overrides: dict[str, dict[str, str]] = Field(default_factory=dict)  # {ma_da: {field: value}}


class AuditLogEntry(ApiModel):
    at: str
    ma_da: str
    field: str
    old_val: str = ""
    new_val: str = ""
    by: str = ""


class SessionDraftSaveRequest(ApiModel):
    session_id: str
    cycle_id: str
    mapping_id: str | None = None
    rows: list[ReportRow]
    overrides: dict[str, dict[str, str]] = Field(default_factory=dict)
    audit_logs: list[AuditLogEntry] = Field(default_factory=list)


class SessionDraftOut(ApiModel):
    session_id: str
    cycle_id: str
    mapping_id: str | None = None
    rows: list[ReportRow]
    overrides: dict[str, dict[str, str]]
    audit_logs: list[AuditLogEntry]
    updated_at: datetime

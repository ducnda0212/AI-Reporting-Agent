import pytest
from pydantic import ValidationError

from app.schemas.mapping import MappingColumnDef, MappingConfigCreate, RecalculateRequest, ValueMappings


def test_mapping_schemas_validation():
    col = MappingColumnDef(
        field_id="pic", col_letter="F", name="Đầu mối",
        source_type="jira", source_field="Assignee",
        fallbacks=["Custom field (PO)"], required=True,
    )
    assert col.field_id == "pic"
    assert len(col.fallbacks) == 1

    vm = ValueMappings(
        status_map={"In Progress": "Đang thực hiện"},
        progress_map={"On-track": "Đúng tiến độ"},
        phase_map={"1": "1. Khảo sát"},
    )
    assert vm.status_map["In Progress"] == "Đang thực hiện"


def test_create_and_recalculate_defaults_and_validation():
    cfg = MappingConfigCreate(name="X", columns=[], value_mappings=ValueMappings())
    assert cfg.description is None and cfg.value_mappings.status_map == {}
    req = RecalculateRequest(session_id="s", orphan_assignments=[{"key": "A-1", "target_ma_da": "I.C.1.2"}])
    assert req.mapping_id is None and req.overrides == {}
    with pytest.raises(ValidationError):
        MappingColumnDef(field_id="x", col_letter="A", name="x", source_type="bogus")

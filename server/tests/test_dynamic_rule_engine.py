import json
from datetime import date

from server.app.models.mapping import MappingConfig
from server.app.modules.mapping.rule_engine import map_jira_issue_to_row

WEEKS = [{"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)}]
ISSUE = {
    "Issue key": "KEY-1", "Summary": "I.C.1.2 Test", "Status": "In Progress", "Assignee": "Test PIC",
    "Custom field (PO)": "PO Guy", "Custom field (Progress)": "On-track", "Custom field (AI Lifecycle)": "Phase 4",
}


def _cfg(value_mappings: dict, columns: list | None = None) -> MappingConfig:
    return MappingConfig(id="custom_01", name="Custom", columns_json=json.dumps(columns or []),
                         value_mappings_json=json.dumps(value_mappings))


def test_rule_engine_with_custom_mapping_config():
    custom_map = _cfg({"status_map": {"In Progress": "Đang làm gấp"}, "progress_map": {}, "phase_map": {}})
    row = map_jira_issue_to_row(ISSUE, None, WEEKS, stt=1, mapping_config=custom_map)
    assert row.trang_thai == "Đang làm gấp"
    assert row.tien_do == "Đúng tiến độ"  # empty progress_map -> defaults


def test_custom_progress_phase_and_source_columns():
    cfg = _cfg(
        {"status_map": {}, "progress_map": {"On-track": "OK"}, "phase_map": {"4": "4. Phát triển mô hình AI"}},
        [{"field_id": "pic", "col_letter": "F", "name": "PIC", "source_type": "jira",
          "source_field": "Custom field (PO)", "fallbacks": ["Assignee"], "required": True}],
    )
    row = map_jira_issue_to_row(ISSUE, None, WEEKS, stt=1, mapping_config=cfg)
    assert (row.tien_do, row.ai_lifecycle_phase) == ("OK", "4. Phát triển mô hình AI")
    assert row.pic == "PO Guy"
    assert row.trang_thai == "Đang thực hiện"  # empty status_map -> defaults


def test_no_mapping_config_keeps_phase1_defaults():
    row = map_jira_issue_to_row(ISSUE, None, WEEKS, stt=1)
    assert (row.trang_thai, row.pic, row.tien_do) == ("Đang thực hiện", "Test PIC", "Đúng tiến độ")

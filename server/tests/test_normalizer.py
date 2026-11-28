from datetime import date

from server.app.modules.mapping.normalizer import (
    PHASE_NAMES, PROGRESS_VALUES, STATUS_VALUES,
    normalize_phase, normalize_progress, normalize_status, parse_jira_date,
)


def test_normalization_rules():
    assert normalize_status("In Progress") == "Đang thực hiện"
    assert normalize_status("Closed") == "Đã hoàn thành"
    assert normalize_status("Unknown Status") == "Unknown Status"  # preserved -> W_UNMAPPED_VALUE

    assert normalize_progress("On-track") == "Đúng tiến độ"
    assert normalize_progress("At Risk") == "Có rủi ro"

    # Deviation from plan: step 7 in the client's 12-step lifecycle is "Phát triển phần mềm"
    assert normalize_phase("7. Triển khai thử nghiệm pilot") == "7.Phát triển phần mềm"

    assert parse_jira_date("10/31/2026 18:00") == date(2026, 10, 31)
    assert parse_jira_date("07/Nov/26 12:00 AM") == date(2026, 11, 7)
    assert parse_jira_date("2026-11-15") == date(2026, 11, 15)


def test_keys_are_case_and_separator_insensitive_and_real_jira_values():
    assert normalize_progress("On track") == "Đúng tiến độ"  # golden dataset spelling
    assert normalize_progress("ON_TRACK") == "Đúng tiến độ"
    assert normalize_status("TO DO") == "Chưa thực hiện"
    assert normalize_status("  done ") == "Đã hoàn thành"
    assert normalize_status("Pending") == "Tạm dừng"
    assert normalize_progress("Delayed") == "Chậm tiến độ"
    assert normalize_progress("Late") == normalize_progress("late") == normalize_progress("Behind schedule") == "Chậm tiến độ"


def test_unmapped_and_empty_values_are_never_guessed():
    assert normalize_status("Monitoring") == "Monitoring"
    assert normalize_status("Cancled") == "Cancled"
    assert normalize_status("Blocked") == "Blocked"  # PMO has not decided yet
    assert normalize_progress("Not tracking") == "Not tracking"
    assert normalize_status(None) == "" and normalize_progress("") == ""
    assert "Monitoring" not in STATUS_VALUES and "Có rủi ro" in PROGRESS_VALUES


def test_phase_numbers_and_unknowns():
    assert len(PHASE_NAMES) == 12
    assert normalize_phase("9. Kiểm thử chất lượng (SIT/UAT/A-B Test)") == "9.Kiểm thử & UAT"
    assert normalize_phase("Phase 2") == "2.Xác định yêu cầu nghiệp vụ chi tiết (PRD)"
    assert normalize_phase("TBD") == ""
    assert normalize_phase(None) == ""
    assert normalize_phase("99. không có") == "99. không có"


def test_parse_jira_date_variants():
    assert parse_jira_date("31/Dec/26 12:00 AM") == date(2026, 12, 31)
    assert parse_jira_date("9/14/2026 14:44") == date(2026, 9, 14)
    assert parse_jira_date("25/12/2026") == date(2026, 12, 25)  # day>12 -> d/m/Y
    assert parse_jira_date("") is None and parse_jira_date(None) is None
    assert parse_jira_date("không phải ngày") is None

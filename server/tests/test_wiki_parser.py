from datetime import date

from server.app.modules.mapping.wiki_parser import (
    parse_milestones, parse_progress_report, parse_risk_notes, sanitize_jira_markup,
)

WEEKS = [
    {"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)},
    {"week": 2, "start": date(2026, 11, 7), "end": date(2026, 11, 14)},
    {"week": 3, "start": date(2026, 11, 15), "end": date(2026, 11, 22)},
    {"week": 4, "start": date(2026, 11, 23), "end": date(2026, 11, 30)},
]


def test_sanitize_jira_markup_links_and_colors():
    raw = "{color:red}Important{color} with link [Feature Link|https://jira.example.com] and ApprovalsCFValue{approvals=[]}"
    clean = sanitize_jira_markup(raw)
    assert "{color" not in clean
    assert "ApprovalsCFValue" not in clean
    assert "Feature Link" in clean
    assert "|" not in clean


def test_sanitize_smart_link_ticket_ref_crlf_and_bold():
    assert sanitize_jira_markup("[https://x.atlassian.net/browse/A-1|smart-link]") == "https://x.atlassian.net/browse/A-1"
    assert sanitize_jira_markup("xem [LADP-465] và *quan trọng*") == "xem LADP-465 và quan trọng"
    assert sanitize_jira_markup("a\r\nb") == "a\nb"
    assert sanitize_jira_markup(None) == ""


def test_parse_progress_report_with_blockers():
    sample_table = (
        "||*Week*||*Mục tiêu/Tiến độ*||*Công việc sẽ làm*||\n"
        "|{{2026-10-31}}|# *Mục tiêu và tiến độ:* Pilot giai đoạn 1.\n"
        "# *Blockers:* Tỉ lệ chấp nhận ngày đầu thấp.|* Tối ưu hiển thị notification|\n"
        "|{{2026-11-07}}|# *Mục tiêu và tiến độ:* Mở rộng pilot lên 10% tài xế.\n"
        "# *Blockers:* Cần phê duyệt từ Ban Giám đốc.|* Chuẩn bị slide báo cáo|\n"
    )
    parsed = parse_progress_report(sample_table, WEEKS)
    assert parsed[1]["completed"].startswith("[2026-10-31] ")
    assert "Pilot giai đoạn 1" in parsed[1]["completed"]
    assert "Blockers" not in parsed[1]["completed"]
    assert "Tỉ lệ chấp nhận ngày đầu thấp" in parsed[1]["blockers"]
    assert "Tối ưu hiển thị notification" in parsed[1]["plan"]
    assert "Cần phê duyệt từ Ban Giám đốc" in parsed[2]["blockers"]


def test_wiki_link_with_pipe_inside_cell_does_not_shift_columns():
    table = (
        "||*Week*||*A*||*B*||\n"
        "|{{2026-11-15}}|Xong [Spec|https://c.example/spec] rồi.|* Làm tiếp [LADP-1|https://j/1]|\n"
    )
    wk = parse_progress_report(table, WEEKS)[3]
    assert "Spec" in wk["completed"] and "https://c.example" not in wk["completed"]
    assert "LADP-1" in wk["plan"]
    assert wk["blockers"] == ""


def test_multiline_rows_without_blockers_and_same_week_entries_are_joined():
    table = (
        "||*Week*||*A*||*B*||\n"
        "|{{2026-11-15}}|*Mục tiêu:* một\n*Tiến độ:* hai|* kế hoạch 1\n* kế hoạch 2|\n"
        "|{{2026-11-20}}|ba|bốn|\n"
        "|{{2026-09-01}}|ngoài kỳ|x|\n"
    )
    parsed = parse_progress_report(table, WEEKS)
    assert set(parsed) == {3}  # 2026-09-01 is outside every week boundary
    # rule AL: prefer the part after "Tiến độ:"; every entry keeps its [date] prefix
    assert "[2026-11-15] hai" in parsed[3]["completed"] and "một" not in parsed[3]["completed"]
    assert "[2026-11-20] ba" in parsed[3]["completed"]
    assert "kế hoạch 2" in parsed[3]["plan"] and "bốn" in parsed[3]["plan"]


def test_parse_progress_report_empty_input():
    assert parse_progress_report("", WEEKS) == {}
    assert parse_progress_report(None, WEEKS) == {}


def test_parse_risk_notes_by_week():
    table = (
        "||*STT*||*Date*||*Mô tả issue/risk*||*Todo*||*PIC*||*Deadline*||\n"
        "|1|2026-10-31|Lệch tải Kafka|Mở rộng cụm|Phạm D (PIC)|2026-11-03|\n"
        "|2|2026-11-07|Thiết bị cũ giật lag|Tối ưu|Hoàng G|2026-11-12|\n"
    )
    r = parse_risk_notes(table, WEEKS)
    assert "Lệch tải Kafka" in r[1] and "Mở rộng cụm" in r[1]
    assert "Thiết bị cũ giật lag" in r[2]


def test_parse_milestones_splits_goal_and_milestone():
    desc = "2. MỤC TIÊU\n- Giảm thời gian chờ\n\n4. MILESTONES:\n{{2026-06-01}} Khởi tạo\n{{2026-12-31}} (PROD) Go-live"
    goal, ms = parse_milestones(desc)
    assert "Giảm thời gian chờ" in goal and "MILESTONE" not in goal
    assert "{{" not in ms and "2026-12-31" in ms and "Go-live" in ms
    assert parse_milestones("không có mốc") == ("không có mốc", "")
    assert parse_milestones("") == ("", "")


def test_sanitize_arrows_and_comparators():
    assert sanitize_jira_markup("A -> B --> C, >= 12%, <= 5") == "A → B → C, ≥ 12%, ≤ 5"

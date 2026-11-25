from datetime import date

from server.app.modules.mapping.rule_engine import extract_project_code_and_name, map_jira_issue_to_row

WEEKS = [
    {"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)},
    {"week": 2, "start": date(2026, 11, 7), "end": date(2026, 11, 14)},
    {"week": 3, "start": date(2026, 11, 15), "end": date(2026, 11, 22)},
    {"week": 4, "start": date(2026, 11, 23), "end": date(2026, 11, 30)},
]


def test_extract_project_code():
    code, name = extract_project_code_and_name("I.C.1.2 Xây dựng mô hình gợi ý điểm đỗ theo cụm")
    assert code == "I.C.1.2"
    assert name == "Xây dựng mô hình gợi ý điểm đỗ theo cụm"

    bad_code, bad_name = extract_project_code_and_name("Chỉ là tiêu đề thường không có mã")
    assert bad_code is None
    assert bad_name == "Chỉ là tiêu đề thường không có mã"
    assert extract_project_code_and_name("x.x.x Mục giữ chỗ")[0] is None
    assert extract_project_code_and_name("I.A.5.2.1 Feature store")[0] == "I.A.5.2.1"


def test_map_jira_issue_to_row():
    issue = {
        "Issue key": "PMOGOLD-1",
        "Summary": "I.C.1.2 Thuật toán gợi ý điểm đỗ",
        "Description": "Mục tiêu hệ thống\nMILESTONES: {{2026-11-20}} Go-live",
        "Assignee": "Đức Nguyễn",
        "Custom field (Start date)": "10/01/2026 00:00",
        "Due date": "11/30/2026 23:59",
        "Status": "In Progress",
        "Custom field (Progress)": "On-track",
        "Custom field (AI Lifecycle)": "4. Phát triển mô hình AI",
    }
    catalog = {"I.C.1.2": {"mang_viec": "AI Mobility"}}
    row = map_jira_issue_to_row(issue, catalog.get("I.C.1.2"), WEEKS, i=0)

    assert row.ma == "I.C.1.2"
    assert row.key == "PMOGOLD-1"
    assert row.mang == "AI Mobility"
    assert row.muctieu == "Mục tiêu hệ thống"
    assert "2026-11-20" in row.milestone and "Go-live" in row.milestone
    assert row.pic == "Đức Nguyễn"
    assert row.start == "01/10/2026" and row.end == "30/11/2026"
    assert row.tt == "Đang thực hiện"
    assert row.td == "Đúng tiến độ"
    assert row.tt1 == "Đang thực hiện Đúng tiến độ"
    assert (row.buocso, row.buoc, row.done) == ("Bước 4", "4.Thiết kế giải pháp", 4)
    assert row.stages[:5] == ["done", "done", "doing", "doing", "todo"]
    assert row.loai == "KHHĐ 2026"
    assert row.market == "VN"


def test_pic_fallback_kpi_table_goal_fallback_and_default_workstream():
    issue = {
        "Summary": "I.A.9.9 Dự án thử",
        "Description": "chỉ mô tả, không mốc",
        "Assignee": "",
        "Custom field (PO)": "Lê Ngọc Anh",
        "Custom field (Tech lead)": "Trần Quốc Bảo",
        "Custom field (Goals)": "Mục tiêu từ Goals",
        "Custom field (KPI/Outcome)": "||*STT*||*KPI*||*Chỉ số chính*||*KQ*||\n|1|Pickup ETA|<= 5.0 phút|Đạt|\n|2|Hủy cuốc|<= 8%|Đạt|",
        "Status": "Monitoring",
        "Custom field (Phase)": "TBD",
    }
    row = map_jira_issue_to_row(issue, None, WEEKS, i=6)
    assert row.i == 6
    assert row.pic == "Lê Ngọc Anh" and row.po == "Lê Ngọc Anh"
    assert row.muctieu == "Mục tiêu từ Goals"
    assert row.kpi == "1. Pickup ETA\n2. Hủy cuốc"  # rule E: "STT. KPI" per line
    assert row.mang == "I.A.9"  # no catalog entry -> workstream prefix
    assert row.tt == "Monitoring"  # unmapped kept raw for W_UNMAPPED_VALUE
    assert row.buocso == ""
    assert row.start == ""


def test_weekly_blocks_from_progress_report_and_risk_notes():
    issue = {
        "Summary": "I.C.1.2 X",
        "Custom field (Progress Report)": (
            "||*Week*||*A*||*B*||\n"
            "|{{2026-10-31}}|# *Mục tiêu và tiến độ:* Pilot 1.\n# *Blockers:* Lệch tải Kafka.|* Tăng partition|\n"
            "|{{2026-11-07}}|# *Mục tiêu và tiến độ:* Pilot 2.|* Fallback rule|\n"
        ),
        "Custom field (Risk Notes)": "||*STT*||*Date*||*Mô tả*||*Todo*||\n|1|2026-11-07|Thiết bị cũ lag|Tối ưu heatmap|",
    }
    row = map_jira_issue_to_row(issue, None, WEEKS, i=0)
    assert "Pilot 1" in row.w1ht and "Tăng partition" in row.w1kh
    assert "Lệch tải Kafka" in row.w1vd
    assert "Pilot 2" in row.w2ht and "Fallback rule" in row.w2kh
    assert "Thiết bị cũ lag" in row.w2vd
    assert row.ht == "" and row.w4vd == ""
    assert row.w1ht.startswith("[2026-10-31]")


def test_goal_rule_joins_lines_and_has_no_whole_description_fallback():
    base = {"Summary": "I.C.1.2 X"}
    desc = "*Giảm thời gian chờ*\nTăng tỉ lệ nhận cuốc\n\n4. MILESTONES:\n{{2026-12-31}} (PROD) Go-live\n+ chi tiết"
    row = map_jira_issue_to_row({**base, "Description": desc}, None, WEEKS, 1)
    assert row.muctieu == "Giảm thời gian chờ Tăng tỉ lệ nhận cuốc"
    assert row.milestone.splitlines() == ["2026-12-31 (PROD) Go-live", "+ chi tiết"]
    no_header = {**base, "Description": "mô tả dài không có tiêu đề mốc"}
    assert map_jira_issue_to_row(no_header, None, WEEKS, 1).muctieu == ""
    assert map_jira_issue_to_row({**no_header, "Custom field (Business Goal)": "BG"}, None, WEEKS, 1).muctieu == "BG"
    both = {**no_header, "Custom field (Goals)": "G", "Custom field (Business Goal)": "BG"}
    assert map_jira_issue_to_row(both, None, WEEKS, 1).muctieu == "G"


def test_progress_report_prefers_text_after_tien_do():
    table = "||*W*||*A*||*B*||\n|{{2026-11-06}}|*Mục tiêu:* mục tiêu tuần\n*Tiến độ:* đã xong 80%|* kế hoạch|\n"
    row = map_jira_issue_to_row({"Summary": "I.C.1.2 X", "Custom field (Progress Report)": table}, None, WEEKS, 1)
    assert row.w1ht == "[2026-11-06] đã xong 80%"


def test_org_fields_priority_link_and_status_category_fallback():
    issue = {
        "Summary": "I.C.1.2 X", "Status": "", "Status category": "In Progress",
        "Custom field (Board of Management)": "Fajar", "Custom field (Department)": "Phòng AI",
        "Custom field (Business Owner)": "BO", "Custom field (PO)": "", "Custom field (Product manager)": "PM",
        "Custom field (Dev-BE)": "An, Bình", "Custom field (Dev-FE)": "Bình, Chi",
        "Custom field (Developer)": "", "Custom field (Developers)": "An",
        "Priority": "High",
        "Custom field (PRD)_0": "Link: PRD", "Custom field (PRD)_1": "xem https://wiki.example/prd/1 nhé",
        "Custom field (PRD (URL))": "https://other.example",
    }
    row = map_jira_issue_to_row(issue, None, WEEKS, 1)
    assert row.tt == "Đang thực hiện"
    assert (row.gdk, row.phong, row.bo) == ("Fajar", "Phòng AI", "BO")
    assert row.po == "PM"
    assert row.swe == "An\nBình\nChi"
    assert row.prio == "High"
    assert row.link == "https://wiki.example/prd/1"
    assert map_jira_issue_to_row({"Summary": "I.C.1.2 X"}, None, WEEKS, 1).link == ""

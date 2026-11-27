from datetime import date

from server.app.modules.mapping.reconciler import reconcile_issues

WEEKS = [{"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)}]
CATALOG = {"I.C.1.2": {"mang_viec": "AI Mobility"}, "I.A.4.1": {"mang_viec": "Food"}, "I.A.4.2": {"mang_viec": "Food"}}


def test_reconciler_choice_a_and_orphans():
    records = [
        {"Issue key": "MAIN-1", "Summary": "I.C.1.2 Dự án gợi ý điểm đỗ", "Issue Type": "Epic", "Status": "In Progress"},
        {"Issue key": "SUB-1", "Parent key": "MAIN-1", "Summary": "Viết API Docker", "Issue Type": "Sub-task", "Status": "Done"},
        {"Issue key": "ORPHAN-1", "Summary": "Hỗ trợ họp PMO không mã DA", "Issue Type": "Task", "Status": "Open"},
    ]
    rows, orphans = reconcile_issues(records, CATALOG, WEEKS)
    assert len(rows) == 1
    assert rows[0].ma == "I.C.1.2"
    assert len(rows[0].subtasks) == 1
    assert rows[0].subtasks[0].key == "SUB-1"
    assert rows[0].subtasks[0].status == "Done"
    # Choice A: child status never changes the main ticket
    assert rows[0].tt == "Đang thực hiện"

    assert len(orphans) == 1
    assert orphans[0].key == "ORPHAN-1"
    assert orphans[0].reason == "NO_DA_CODE"


def test_code_children_grandchildren_and_unknown_codes():
    records = [
        {"Issue key": "A", "Summary": "I.C.1.2 Epic", "Issue Type": "Epic", "Status": "To Do"},
        {"Issue key": "B", "Parent key": "A", "Summary": "I.C.1.2.1 Dự báo", "Issue Type": "Task", "Status": "Done"},
        {"Issue key": "C", "Parent key": "B", "Summary": "Subtask không mã", "Issue Type": "Subtask", "Status": "Done"},
        {"Issue key": "D", "Parent key": "A", "Summary": "x.x.x placeholder", "Issue Type": "Task", "Status": "Cancled"},
        {"Issue key": "E", "Parent key": "A", "Summary": "IV.Z.99.99 Ngoài mẫu", "Issue Type": "Task", "Status": "Pending"},
        {"Issue key": "F", "Parent key": "E", "Summary": "Con của orphan", "Issue Type": "Subtask", "Status": "Done"},
        {"Issue key": "G", "Parent key": "GHOST", "Summary": "Cha không có trong file", "Issue Type": "Task", "Status": "Done"},
        {"Issue key": "H", "Summary": "I.A.4.2 Task có mã riêng", "Parent key": "I", "Issue Type": "Task", "Status": "To Do"},
        {"Issue key": "I", "Summary": "I.A.4.1 Epic Food", "Issue Type": "Epic", "Status": "To Do"},
        {"Issue key": "J", "Summary": "I.C.1.2 Trùng mã", "Issue Type": "Epic", "Status": "To Do"},
    ]
    rows, orphans = reconcile_issues(records, CATALOG, WEEKS)
    by = {r.ma: r for r in rows}
    assert set(by) == {"I.C.1.2", "I.A.4.1", "I.A.4.2", "IV.Z.99.99"}
    assert by["IV.Z.99.99"].isNew is True and by["IV.Z.99.99"].tplRow == 0 and by["I.C.1.2"].isNew is False
    assert [s.key for s in by["IV.Z.99.99"].subtasks] == ["F"]
    assert [s.key for s in by["I.C.1.2"].subtasks] == ["B", "C", "D"]
    assert by["I.A.4.2"].subtasks == [] and by["I.A.4.1"].subtasks == []  # coded task is its own row
    reasons = {o.key: o.reason for o in orphans}
    assert reasons == {
        "G": "NO_DA_CODE", "J": "DUPLICATE_DA_CODE",
    }
    assert [r.i for r in rows] == [0, 1, 2, 3]


def test_csv_driven_projects_xx_codes_and_subtask_order():
    records = [
        {"Issue key": "SUB-EARLY", "Parent key": "M1", "Summary": "I.C.1.2 Subtask trùng mã đứng trước", "Issue Type": "Subtask", "Status": "Done"},
        {"Issue key": "M1", "Summary": "I.C.1.2 Dự án chính", "Issue Type": "Epic", "Status": "In Progress"},
        {"Issue key": "XX-1", "Summary": "x.x.20 Cảnh báo SLA", "Issue Type": "Epic", "Status": "To Do"},
        {"Issue key": "XX-2", "Parent key": "XX-1", "Summary": "x.x.x Giữ chỗ", "Issue Type": "Task", "Status": "To Do"},
        {"Issue key": "NEW-1", "Summary": "I.C.1.15 Dự án mới ngoài Excel", "Issue Type": "Epic", "Status": "To Do"},
        {"Issue key": "NEW-1-SUB", "Parent key": "NEW-1", "Summary": "I.C.1.15.1 Việc con dự án mới", "Issue Type": "Task", "Status": "Done"},
        {"Issue key": "NEW-1-DEEP", "Summary": "I.C.1.15.1.2 Cháu nhiều cấp", "Issue Type": "Task", "Status": "Done"},
        {"Issue key": "NOPARENT", "Summary": "x.x.x Không cha", "Issue Type": "Task", "Status": "To Do"},
    ]
    rows, orphans = reconcile_issues(records, CATALOG, WEEKS)
    by = {r.ma: r for r in rows}
    assert set(by) == {"I.C.1.2", "x.x.20", "I.C.1.15"}
    assert by["I.C.1.2"].key == "M1" and by["I.C.1.2"].isNew is False
    assert by["I.C.1.15"].isNew is True and by["I.C.1.15"].tplRow == 0
    assert [s.key for s in by["I.C.1.15"].subtasks] == ["NEW-1-SUB", "NEW-1-DEEP"]
    assert [s.key for s in by["x.x.20"].subtasks] == ["XX-2"]
    assert [(o.key, o.reason) for o in orphans] == [("SUB-EARLY", "DUPLICATE_DA_CODE"), ("NOPARENT", "NO_DA_CODE")]

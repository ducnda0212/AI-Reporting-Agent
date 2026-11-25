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
    assert set(by) == {"I.C.1.2", "I.A.4.1", "I.A.4.2"}
    assert [s.key for s in by["I.C.1.2"].subtasks] == ["B", "C", "D"]
    assert by["I.A.4.2"].subtasks == [] and by["I.A.4.1"].subtasks == []  # coded task is its own row
    reasons = {o.key: o.reason for o in orphans}
    assert reasons == {
        "E": "CODE_NOT_IN_CATALOG", "F": "NO_DA_CODE", "G": "NO_DA_CODE", "J": "DUPLICATE_DA_CODE",
    }
    assert [r.i for r in rows] == [0, 1, 2]

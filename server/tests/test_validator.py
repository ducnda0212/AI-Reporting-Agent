from datetime import date

from server.app.modules.ingestion.validator import validate_rows
from server.app.schemas.ingest import OrphanIssue
from server.app.schemas.row import ReportRow, SubtaskAudit

REF = date(2026, 11, 19)


def _row(**kw) -> ReportRow:
    base = dict(stt=1, issue_key="K-1", ma_da="I.C.1.2", cong_viec="T", trang_thai="Đang thực hiện",
                tien_do="Đúng tiến độ", pic="A", bat_dau=date(2026, 10, 1), ket_thuc=date(2026, 12, 31))
    return ReportRow(**{**base, **kw})


def test_validator_detects_blockers_and_progress_conflicts():
    row_conflict = ReportRow(
        stt=1, ma_da="I.C.1.2", cong_viec="Test",
        trang_thai="Đang thực hiện", tien_do="Đúng tiến độ",
        ket_thuc=date(2026, 11, 10),
        van_de_w2="Cần phê duyệt từ Ban Giám đốc do bị chậm",
        pic="Nguyen Van A", bat_dau=date(2026, 10, 1),
    )
    orphan = OrphanIssue(key="PKD-202", summary="Không có mã", issue_type="Task", status="Open", reason="NO_DA_CODE")

    blockers, warnings = validate_rows([row_conflict], [orphan], ref_date=REF)

    assert any(b.code == "E_NO_CODE" and b.key == "PKD-202" for b in blockers)
    assert any(w.code == "W_PROGRESS_CONFLICT" for w in warnings)


def test_clean_row_has_no_findings():
    assert validate_rows([_row()], [], REF) == ([], [])


def test_overdue_alone_conflicts_but_finished_projects_do_not():
    _, w = validate_rows([_row(ket_thuc=date(2026, 11, 1))], [], REF)
    assert [x.code for x in w] == ["W_PROGRESS_CONFLICT"] and w[0].key == "K-1"
    done = _row(trang_thai="Đã hoàn thành", ket_thuc=date(2026, 8, 30), van_de_w1="từng bị chậm")
    assert validate_rows([done], [], REF) == ([], [])


def test_keyword_in_completed_text_and_blocker_text_trigger_conflict():
    for kw in ({"hoan_thanh_w1": "Đã lùi lịch go-live"}, {"van_de_w3": "Lệch tải Kafka"}):
        _, w = validate_rows([_row(**kw)], [], REF)
        assert any(x.code == "W_PROGRESS_CONFLICT" for x in w), kw


def test_late_progress_with_blockers_is_not_a_conflict():
    _, w = validate_rows([_row(tien_do="Chậm tiến độ", van_de_w1="chậm vì Kafka")], [], REF)
    assert w == []


def test_required_fields_missing_on_active_project():
    b, _ = validate_rows([_row(pic="", ket_thuc=None)], [], REF)
    assert {(x.code, x.field) for x in b} == {("E_REQUIRED", "pic"), ("E_REQUIRED", "ket_thuc")}
    b, _ = validate_rows([_row(pic="", trang_thai="Hủy", tien_do="Tạm dừng")], [], REF)
    assert b == []


def test_unmapped_status_and_progress_warn_and_catalog_orphans_do_not_block():
    _, w = validate_rows([_row(trang_thai="Monitoring", tien_do="Late")], [], REF)
    fields = {(x.code, x.field) for x in w}
    assert fields == {("W_UNMAPPED_VALUE", "trang_thai"), ("W_UNMAPPED_VALUE", "tien_do")}
    orphan = OrphanIssue(key="X", summary="IV.Z.99.99", reason="CODE_NOT_IN_CATALOG")
    assert validate_rows([], [orphan], REF)[0] == []


def test_unmapped_subtask_status_warns_by_subtask_key_without_touching_parent():
    subs = [SubtaskAudit(key="S-1", status="Monitoring"), SubtaskAudit(key="S-2", status="Done"),
            SubtaskAudit(key="S-3", status="Cancled")]
    row = _row(subtasks=subs)
    _, w = validate_rows([row], [], REF)
    assert {(x.code, x.key, x.field) for x in w} == {
        ("W_UNMAPPED_VALUE", "S-1", "subtasks.status"), ("W_UNMAPPED_VALUE", "S-3", "subtasks.status")}
    assert row.trang_thai == "Đang thực hiện"

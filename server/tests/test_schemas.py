from datetime import date

from server.app.schemas.ingest import (
    BlockerIssue, DiffSummary, FileStats, IngestResponse, OrphanIssue, WarningIssue,
)
from server.app.schemas.row import COLUMN_FIELDS, ReportRow, SubtaskAudit


def test_report_row_schema_validation():
    row = ReportRow(
        stt=1,
        ma_da="I.C.1.2",
        cong_viec="Xây dựng API gợi ý điểm đỗ",
        mang_viec="AI Optimization",
        muc_tieu="Đạt AUC 0.85",
        kpi="Độ trễ P95 < 200ms",
        pic="Trần Văn B",
        bat_dau=date(2026, 10, 1),
        ket_thuc=date(2026, 11, 30),
        trang_thai="Đang thực hiện",
        tien_do="Đúng tiến độ",
        subtasks=[SubtaskAudit(key="LADP-101", summary="Subtask 1", status="Done", assignee="B")],
    )
    assert row.ma_da == "I.C.1.2"
    assert len(row.subtasks) == 1
    assert row.subtasks[0].key == "LADP-101"


def test_template_columns_cover_a_to_aw_in_order():
    # 49 template columns A..AW (X is the untitled spacer column)
    assert len(COLUMN_FIELDS) == 49
    assert COLUMN_FIELDS["A"] == "mang_viec"
    assert COLUMN_FIELDS["B"] == "ma_da"
    assert COLUMN_FIELDS["AA"] == "trang_thai_1"
    assert COLUMN_FIELDS["AI"] == "market"
    assert COLUMN_FIELDS["AL"] == "hoan_thanh_w1"
    assert COLUMN_FIELDS["AW"] == "van_de_w4"
    fields = set(ReportRow.model_fields)
    assert {f for f in COLUMN_FIELDS.values() if f} <= fields


def test_row_defaults_and_ingest_response_shape():
    row = ReportRow(stt=1, ma_da="I.A.3.1", cong_viec="x")
    assert row.needs_review is False and row.overrides == {} and row.subtasks == []
    resp = IngestResponse(
        success=True, session_id="s", is_duplicate_file=False,
        file_stats=FileStats(total_rows=1, total_cols=2, skipped_empty_rows=0, matched_projects=1),
        diff_summary=DiffSummary(has_previous_session=False),
        rows=[row],
        orphans=[OrphanIssue(key="K", summary="s", issue_type="Task", status="Open", reason="NO_DA_CODE")],
        blockers=[BlockerIssue(code="E_NO_CODE", message="m", key="K")],
        warnings=[WarningIssue(code="W_UNMAPPED_VALUE", message="m", key="K", field="trang_thai")],
    )
    dumped = resp.model_dump(mode="json")
    assert dumped["rows"][0]["ma_da"] == "I.A.3.1"
    assert dumped["diff_summary"]["added_projects"] == []

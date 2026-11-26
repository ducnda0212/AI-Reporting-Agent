from datetime import date

from server.app.schemas.ingest import (
    BlockerIssue, DiffSummary, FileStats, IngestResponse, OrphanIssue, WarningIssue,
)
from server.app.schemas.row import COLUMN_FIELDS, ReportRow, SubtaskAudit


def test_report_row_schema_validation():
    row = ReportRow(
        i=0,
        ma="I.C.1.2",
        viec="Xây dựng API gợi ý điểm đỗ",
        mang="AI Optimization",
        muctieu="Đạt AUC 0.85",
        kpi="Độ trễ P95 < 200ms",
        pic="Trần Văn B",
        start="01/10/2026",
        end="30/11/2026",
        tt="Đang thực hiện",
        td="Đúng tiến độ",
        subtasks=[SubtaskAudit(key="LADP-101", summary="Subtask 1", status="Done", assignee="B")],
    )
    assert row.ma == "I.C.1.2"
    assert len(row.subtasks) == 1
    assert row.subtasks[0].key == "LADP-101"


def test_template_columns_cover_a_to_aw_in_order():
    # 49 template columns A..AW (X is the untitled spacer column)
    assert len(COLUMN_FIELDS) == 49
    assert COLUMN_FIELDS["A"] == "mang"
    assert COLUMN_FIELDS["B"] == "ma"
    assert COLUMN_FIELDS["AA"] == "tt1"
    assert COLUMN_FIELDS["AI"] == "market"
    assert COLUMN_FIELDS["AL"] == "w1ht"
    assert COLUMN_FIELDS["AW"] == "w4vd"
    fields = set(ReportRow.model_fields)
    assert {f for f in COLUMN_FIELDS.values() if f != "x"} <= fields


def test_row_defaults_and_ingest_response_shape():
    row = ReportRow(i=0, ma="I.A.3.1", viec="x")
    assert row.needs_review is False and row.ovr == {} and row.subtasks == []
    resp = IngestResponse(
        success=True, session_id="s", file_name="f.csv", is_duplicate_file=False,
        file_stats=FileStats(total_rows=1, total_cols=2, skipped_empty_rows=0, matched_projects=1),
        diff_summary=DiffSummary(has_previous_session=False),
        rows=[row],
        orphans=[OrphanIssue(key="K", summary="s", issue_type="Task", status="Open", reason="NO_DA_CODE")],
        blockers=[BlockerIssue(code="E_NO_CODE", message="m", key="K")],
        warnings=[WarningIssue(code="W_UNMAPPED_VALUE", message="m", key="K", field="tt")],
    )
    dumped = resp.model_dump(mode="json")
    assert dumped["rows"][0]["ma"] == "I.A.3.1"
    assert dumped["diff_summary"]["added_projects"] == []

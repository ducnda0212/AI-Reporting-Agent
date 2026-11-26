from app.core.database import Base, engine
from app.models.version import ReportVersion
from app.schemas.reporting import ExportExcelRequest, LockReportRequest


def test_report_version_table_and_schemas():
    Base.metadata.create_all(bind=engine)
    assert ReportVersion.__tablename__ == "report_versions"
    req = LockReportRequest(
        session_id="sess_1", cycle_id="2026_11_w4", wk="w4", by="Khuê",
        snap={"I.C.1.2|ma": "I.C.1.2"}, raw_notes={"I.C.1.2": "Note · user"},
    )
    assert req.wk == "w4" and req.raw_notes["I.C.1.2"] == "Note · user"
    exp = ExportExcelRequest(version_id="ver_2026_11_w4_v1")
    assert exp.ex_cols == "vis" and exp.only_current_week is True and exp.append_override_note is True

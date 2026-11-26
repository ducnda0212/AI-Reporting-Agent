import json
from datetime import datetime

import openpyxl

from app.models.version import ReportVersion
from app.modules.reporting.excel_builder import build_excel_from_version, sanitize_export_filename

SHEET = "Mẫu báo cáo"


def _ver(wk="w3", snap=None, raw_notes=None, fmt=None, wrap=None, hidden=None):
    return ReportVersion(
        id=f"ver_2026_11_{wk}_v1", session_id="s1", cycle_id=f"2026_11_{wk}", cycle_month="2026_11",
        wk=wk, version_no=1, locked_by="Khuê", at_label="26/11 12:00", note="", file_name="g.csv",
        snap_json=json.dumps(snap or {}), raw_notes_json=json.dumps(raw_notes or {}),
        fmt_json=json.dumps(fmt or {}), wrap_json=json.dumps(wrap or {}),
        hidden_json=json.dumps(hidden or {}), stats_json="{}", changes_json="[]", edits_json="[]",
    )


def test_only_current_week_preserves_other_weeks_and_false_overwrites():
    snap = {"I.A.4.3|ma": "I.A.4.3", "I.A.4.3|ht": "Done W3", "I.A.4.3|w1vd": "Overwritten W1"}
    v = _ver(wk="w3", snap=snap, hidden={"x": True, "mang": True})
    p_keep, _ = build_excel_from_version(v, only_current_week=True, ex_cols="vis")
    ws1 = openpyxl.load_workbook(p_keep)[SHEET]
    assert ws1["AR5"].value == "Done W3"
    assert ws1["AN5"].value == "Phụ thuộc lịch"  # template W1 preserved when only_current_week=True
    assert ws1.column_dimensions["X"].hidden is True
    assert ws1.column_dimensions["B"].hidden is not True

    p_all, _ = build_excel_from_version(v, only_current_week=False, ex_cols="all")
    ws2 = openpyxl.load_workbook(p_all)[SHEET]
    assert ws2["AN5"].value == "Overwritten W1"
    assert ws2.column_dimensions["X"].hidden is not True


def test_raw_notes_dates_styles_and_new_code():
    snap = {
        "I.C.1.2|ma": "I.C.1.2", "I.C.1.2|start": "01/06/2026", "I.C.1.2|end": "31/12/2026",
        "I.C.1.2|note": "Note A · B · I sửa tay (Jira: OPEN)", "I.C.1.2|ht": "Text W3",
        "I.Z.9.1|ma": "I.Z.9.1", "I.Z.9.1|mang": "New Group", "I.Z.9.1|viec": "New Project",
    }
    v = _ver(wk="w3", snap=snap, raw_notes={"I.C.1.2": "Note A · B"},
             fmt={"I.C.1.2|ht": {"b": True, "color": "#B91C1C"}}, wrap={"I.C.1.2|ht": True})
    ws = openpyxl.load_workbook(build_excel_from_version(v, append_override_note=False)[0])[SHEET]
    r = next(r for r in range(2, 75) if ws.cell(r, 2).value == "I.C.1.2")
    assert ws.cell(r, 14).value == "Note A · B"
    assert isinstance(ws.cell(r, 7).value, datetime) and ws.cell(r, 7).value.strftime("%Y-%m-%d") == "2026-06-01"
    assert ws.cell(r, 7).number_format == "d/m/yyyy"
    assert ws.cell(r, 44).font.bold is True and ws.cell(r, 44).font.color.rgb == "00B91C1C"
    assert ws.cell(r, 44).alignment.wrap_text is True
    assert any(ws.cell(x, 2).value == "I.Z.9.1" and ws.cell(x, 3).value == "New Project" and ws.cell(x, 1).value == "New Group"
               for x in range(70, 90))
    ws2 = openpyxl.load_workbook(build_excel_from_version(v, append_override_note=True)[0])[SHEET]
    assert ws2.cell(r, 14).value == "Note A · B · I sửa tay (Jira: OPEN)"


def test_filename_sanitized():
    assert sanitize_export_filename("../..\evil/x", "d.xlsx") == "x.xlsx"
    assert sanitize_export_filename("", "d.xlsx") == "d.xlsx"
    assert sanitize_export_filename("a.xlsx", "d.xlsx") == "a.xlsx"

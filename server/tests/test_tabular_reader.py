import io

import openpyxl
import pytest

from server.app.modules.mapping.csv_cleaner import InvalidSchemaError
from server.app.modules.mapping.tabular_reader import UnsupportedFormatError, read_tabular


def _make_xlsx(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_read_tabular_xlsx_duplicate_headers_and_empty_rows():
    data = _make_xlsx([
        ["Summary", "Issue key", "Component/s", "Component/s", "Status"],
        ["I.C.1.2 Test Project", "PMO-1", "A", "B", "In Progress"],
        [None, None, None, None, None],
    ])
    res = read_tabular(data, "export.xlsx")
    assert "Component/s_0" in res.headers and "Component/s_1" in res.headers
    assert (res.skipped_empty_rows, res.dup_groups, res.dup_cols) == (1, 1, 2)
    assert res.unique_raw_cols == ["Summary", "Issue key", "Component/s", "Status"]
    assert len(res.records) == 1
    assert res.records[0]["Summary"] == "I.C.1.2 Test Project"
    assert res.records[0]["Component/s_1"] == "B"


def test_read_tabular_csv_matches_xlsx_stats():
    res = read_tabular(b"Summary,Issue key,Label,Label\nI.C.1.2 A,K-1,x,y\n,,,\n", "a.csv")
    assert (res.skipped_empty_rows, res.dup_groups, res.dup_cols, len(res.records)) == (1, 1, 2, 1)


def test_read_tabular_rejects_legacy_xls_missing_cols_and_corrupt_xlsx():
    with pytest.raises(UnsupportedFormatError):
        read_tabular(b"dummy", "old_export.xls")
    with pytest.raises(InvalidSchemaError):
        read_tabular(_make_xlsx([["Summary", "Status"], ["Only summary", "Open"]]), "missing_key.xlsx")
    with pytest.raises(InvalidSchemaError):
        read_tabular(b"not a zip", "bad.xlsx")


def test_xlsx_dates_are_read_as_month_first():
    from datetime import datetime
    data = _make_xlsx([["Summary", "Issue key", "Due date"], ["I.C.1.2 A", "K-1", datetime(2026, 11, 30, 23, 59)]])
    assert read_tabular(data, "d.xlsx").records[0]["Due date"] == "11/30/2026 23:59"

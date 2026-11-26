import unicodedata

import pytest

from server.app.modules.mapping.csv_cleaner import InvalidSchemaError, clean_csv


def _to_cp1258(text: str) -> bytes:
    # cp1258 holds some precomposed letters (ê, â, ơ...) and writes tones as combining marks
    out = bytearray()
    for ch in text:
        nfd = unicodedata.normalize("NFD", ch)
        head, marks = nfd[0], nfd[1:]
        if marks:
            composed = unicodedata.normalize("NFC", head + marks[0])
            try:
                composed.encode("cp1258")
                head, marks = composed, marks[1:]
            except UnicodeEncodeError:
                pass
        out += (head + marks).encode("cp1258")
    return bytes(out)


def test_clean_csv_bom_and_duplicate_headers():
    csv_content = "\ufeffSummary,Issue key,Component/s,Component/s\nProj 1,KEY-1,CompA,CompB\n,,,\nProj 2,KEY-2,CompC,"
    headers, records, skipped = clean_csv(csv_content.encode("utf-8"))
    assert "Component/s_0" in headers
    assert "Component/s_1" in headers
    assert "Summary" in headers and not any(h.startswith("\ufeff") for h in headers)
    assert skipped == 1
    assert len(records) == 2
    assert records[0]["Issue key"] == "KEY-1"
    assert records[0]["Component/s_0"] == "CompA"
    assert records[0]["Component/s_1"] == "CompB"


def test_windows_1258_and_trailing_empty_rows():
    text = "Summary,Issue key,Assignee\nĐiều phối thích ứng cho tài xế,K-1,Nguyễn Đình Anh Đức\n,,\n\n,,\n"
    headers, records, skipped = clean_csv(_to_cp1258(text))
    assert records[0]["Summary"] == "Điều phối thích ứng cho tài xế"
    assert records[0]["Assignee"] == "Nguyễn Đình Anh Đức"
    assert len(records) == 1
    assert skipped == 2  # fully-empty rows are counted; blank physical lines are not rows


def test_semicolon_and_tab_delimiters_and_multiline_cells():
    semi = 'Summary;Issue key\n"line1\nline2";K-1\n'
    _, rec, _ = clean_csv(semi.encode("utf-8"))
    assert rec[0]["Summary"] == "line1\nline2" and rec[0]["Issue key"] == "K-1"
    tab = "Summary\tKey\nA\tK-2\n"
    _, rec, _ = clean_csv(tab.encode("utf-16"))
    assert rec[0]["Issue key"] == "K-2"  # alias "Key" is renamed


@pytest.mark.parametrize("content", ["Summary,Other\nA,B\n", "Key,Other\nK-1,B\n", ""])
def test_missing_required_columns_raises_invalid_schema(content):
    with pytest.raises(InvalidSchemaError):
        clean_csv(content.encode("utf-8"))


def test_header_aliases_are_canonicalised():
    headers, records, _ = clean_csv("﻿ Tiêu đề ,KEY,Trạng thái\nA,K-1,Done\n".encode("utf-8"))
    assert headers == ["Summary", "Issue key", "Status"]
    assert records[0] == {"Summary": "A", "Issue key": "K-1", "Status": "Done"}
    # an existing canonical column is never replaced by an alias
    headers, _, _ = clean_csv("Summary,Issue key,Key\nA,K-1,K-9\n".encode("utf-8"))
    assert headers == ["Summary", "Issue key", "Key"]

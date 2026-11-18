import pytest

from server.parsers.jira_csv_parser import parse_jira_csv


def test_parse_jira_csv_handles_duplicates_and_multiline():
    csv_text = """"Summary","Status","Custom field (PRD)","Custom field (PRD)","Custom field (Progress Report)"
"I.A.5.1 Project A","IN PROGRESS","doc_link_1","doc_link_2","||*Week*||*Progress*||
|2026-11-06|Done task|"
"II.E.1.2 Project B","DONE","doc_link_3","","Single line"
"""
    data = parse_jira_csv(csv_text.encode("utf-8"))
    assert len(data.columns) == 5
    assert data.columns[2].name == "Custom field (PRD)"
    assert data.columns[2].index == 2
    assert data.columns[3].name == "Custom field (PRD)"
    assert data.columns[3].index == 3
    assert len(data.columns[2].sample_values) == 2
    assert len(data.issues) == 2
    assert data.stats["total_cols"] == 5
    assert data.stats["total_issues"] == 2
    assert data.stats["duplicate_groups"] == 1
    # Kiểm tra ô multi-line chứa bảng markdown được đọc nguyên vẹn
    assert "||*Week*||*Progress*||" in data.issues[0]["_raw_by_index"][4]


def test_bom_ragged_rows_blank_lines_and_errors():
    text = "\ufeffA,B,A\n1,2\n\n3,4,5,6\n"
    data = parse_jira_csv(text.encode("utf-8"))
    assert [c.name for c in data.columns] == ["A", "B", "A"]
    assert len(data.issues) == 2
    assert data.issues[0]["_raw_by_index"] == {0: "1", 1: "2", 2: ""}
    assert data.issues[1]["A"] == "3"
    assert data.issues[1]["_raw_by_index"] == {0: "3", 1: "4", 2: "5"}
    with pytest.raises(ValueError):
        parse_jira_csv(b"")
    with pytest.raises(ValueError):
        parse_jira_csv(b"\xff\xfe\x00bad")


def test_parse_perf_200_issues_277_cols():
    import csv, io, time
    from pathlib import Path

    sample = Path(__file__).parent / "data" / "sample_jira_277_cols.csv"
    rows = list(csv.reader(io.StringIO(sample.read_text(encoding="utf-8-sig"), newline="")))
    out = io.StringIO()
    csv.writer(out).writerows([rows[0]] + rows[1:] * 100)
    t0 = time.perf_counter()
    data = parse_jira_csv(out.getvalue().encode("utf-8"))
    assert time.perf_counter() - t0 < 0.3
    assert len(data.columns) == 277

import os

import pytest

from server.app.core.database import Base, SessionLocal, engine
from server.app.models.file import UploadedFile
from server.app.modules.ingestion.diff_engine import compute_diff
from server.app.modules.ingestion.file_handler import save_and_fingerprint
from server.app.schemas.row import ReportRow


@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    s = SessionLocal()
    yield s
    s.query(UploadedFile).delete()
    s.commit()
    s.close()


def test_file_fingerprint_and_diff_override_preservation(db):
    content = b"Summary,Issue key\nTest,T-1"
    file1, is_dup1 = save_and_fingerprint(content, "test.csv", "cycle_2026_11", db, force_reload=False)
    assert not is_dup1

    file2, is_dup2 = save_and_fingerprint(content, "test.csv", "cycle_2026_11", db, force_reload=False)
    assert is_dup2

    prev_row = ReportRow(i=0, ma="I.C.1.2", viec="Old Name", pic="Manual PIC")
    new_row = ReportRow(i=0, ma="I.C.1.2", viec="New Name from Jira", pic="Jira PIC")
    overrides = {"I.C.1.2": {"pic": "Manual PIC"}}

    diff_summary, merged_rows = compute_diff([prev_row], [new_row], overrides)
    assert diff_summary.modified_count == 1
    assert merged_rows[0].pic == "Manual PIC"  # preserved override
    assert merged_rows[0].viec == "New Name from Jira"
    assert merged_rows[0].needs_review is True


def test_duplicate_upload_reuses_record_and_writes_no_second_file(db):
    content = b"Summary,Issue key\nA,K-1"
    f1, _ = save_and_fingerprint(content, "a.csv", "cyc_dup", db, force_reload=False)
    f2, dup = save_and_fingerprint(content, "renamed.csv", "cyc_dup", db, force_reload=False)
    assert dup and f2.id == f1.id and f2.stored_path == f1.stored_path
    assert db.query(UploadedFile).filter_by(cycle_id="cyc_dup").count() == 1
    assert len(os.listdir(os.path.dirname(f1.stored_path))) == 1
    assert open(f1.stored_path, "rb").read() == content

    f3, dup3 = save_and_fingerprint(content, "a.csv", "cyc_dup", db, force_reload=True)
    assert not dup3 and f3.id == f1.id  # forced reload re-parses the stored file, no extra copy

    _, other_cycle_dup = save_and_fingerprint(content, "a.csv", "cyc_other", db, force_reload=False)
    assert not other_cycle_dup
    _, changed_dup = save_and_fingerprint(content + b"x", "a.csv", "cyc_dup", db, force_reload=False)
    assert not changed_dup


def test_cycle_id_and_filename_cannot_escape_uploads_dir(db):
    with pytest.raises(ValueError):
        save_and_fingerprint(b"x", "a.csv", "../evil", db, force_reload=False)
    f, _ = save_and_fingerprint(b"y", "..\..\evil name.csv", "cyc_safe", db, force_reload=False)
    assert os.path.dirname(f.stored_path).endswith("cyc_safe")
    assert ".." not in os.path.basename(f.stored_path)


def test_unchanged_source_keeps_override_without_review_flag():
    prev = ReportRow(i=0, ma="A.1.1", viec="x", pic="Jira PIC")
    new = ReportRow(i=0, ma="A.1.1", viec="x", pic="Jira PIC")
    diff, rows = compute_diff([prev], [new], {"A.1.1": {"pic": "Manual", "nonexistent": "?"}})
    assert diff.modified_count == 0
    assert rows[0].pic == "Manual" and rows[0].needs_review is False
    assert rows[0].ovr == {"pic": "Manual"}  # unknown fields are dropped


def test_added_removed_and_first_session():
    a = ReportRow(i=0, ma="A.1.1", viec="a")
    b = ReportRow(i=1, ma="B.1.1", viec="b")
    diff, rows = compute_diff([a], [a, b], {})
    assert diff.has_previous_session and diff.added_projects == ["B.1.1"] and diff.removed_projects == []
    diff, _ = compute_diff([a, b], [a], {})
    assert diff.removed_projects == ["B.1.1"]
    diff, rows = compute_diff(None, [a], {})
    assert not diff.has_previous_session and diff.added_projects == [] and rows[0].ma == "A.1.1"

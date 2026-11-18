import pytest
from server.services.file_storage_service import FileStorageService


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setattr("server.core.config.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("server.core.config.UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setattr("server.core.config.META_FILE", tmp_path / "uploads_meta.json")
    return FileStorageService()


def test_file_storage_save_and_duplicate(tmp_path, service):
    content = b"Summary,Status\nIssue 1,Open"
    meta1 = service.save_file(content, "jira_report.csv", "w3", total_issues=1, total_cols=2)
    assert meta1.filename == "jira_report.csv"
    assert (tmp_path / "uploads").exists()

    is_dup, dup_meta = service.check_duplicate(content, "w3")
    assert is_dup is True
    assert dup_meta.id == meta1.id

    history = service.get_history()
    assert len(history) == 1
    assert history[0].id == meta1.id


def test_path_traversal_filename_stays_in_uploads(tmp_path, service):
    for name in ["../../evil.csv", r"..\..\evil.csv", r"C:\x\y.csv", "a<b>:c?.csv", "..", ""]:
        m = service.save_file(b"x" + name.encode(), name, "w1", 1, 1)
        p = (tmp_path / "uploads").resolve()
        assert p in __import__("pathlib").Path(m.file_path).resolve().parents
    assert not (tmp_path.parent / "evil.csv").exists()
    assert service.get_history()[0].filename == "upload.csv"


def test_different_week_not_duplicate_and_check_writes_nothing(tmp_path, service):
    content = b"a,b\n1,2"
    service.save_file(content, "r.csv", "w3", 1, 2)
    before = sorted((tmp_path / "uploads").iterdir())
    assert service.check_duplicate(content, "w4") == (False, None)
    assert sorted((tmp_path / "uploads").iterdir()) == before
    assert len(service.get_history()) == 1


def test_history_newest_first_and_hash_fields(service):
    m1 = service.save_file(b"one", "a.csv", "w1", 1, 1)
    m2 = service.save_file(b"two", "b.csv", "w1", 1, 1)
    assert [m.id for m in service.get_history()] == [m2.id, m1.id]
    assert len(m1.file_hash) == 64 and m1.file_size == 3


def test_get_file_by_id_round_trip_and_unknown(service):
    m = service.save_file(b"hello", "a.csv", "w1", 1, 1)
    meta, data = service.get_file_by_id(m.id)
    assert meta.id == m.id and data == b"hello"
    with pytest.raises(KeyError):
        service.get_file_by_id("nope")


def test_corrupt_meta_is_preserved(tmp_path, service):
    (tmp_path / "uploads_meta.json").write_text("{not json")
    assert service.get_history() == []
    assert (tmp_path / "uploads_meta.json.corrupt").read_text() == "{not json"


def test_long_filename_is_capped_and_keeps_extension(service):
    m = service.save_file(b"long", "x" * 400 + ".csv", "w1", 1, 1)
    assert len(m.filename) <= 100 and m.filename.endswith(".csv")

"""Isolate DB + uploads in a temp dir BEFORE any app module is imported."""
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="pmo_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOADS_DIR"] = os.path.join(_TMP, "uploads")
os.environ["EXPORTS_DIR"] = os.path.join(_TMP, "exports")
os.environ["DEFAULT_CYCLE_ID"] = "2026_11_w3"  # pinned: tests assume week 3; auto mode is tested via monkeypatch

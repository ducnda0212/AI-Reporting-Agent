import os

from server.app.core.config import settings
from server.app.core.database import Base, SessionLocal, engine
from server.app.models.catalog import MasterCatalogItem  # noqa: F401
from server.app.models.cycle import ReportingCycle  # noqa: F401
from server.app.models.file import UploadedFile  # noqa: F401


def test_database_and_storage_initialization():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    assert session is not None
    session.close()

    assert os.path.exists(settings.STORAGE_DIR)
    assert os.path.exists(settings.FIXTURES_DIR)
    assert os.path.exists(settings.TEMPLATES_DIR)
    assert os.path.exists(os.path.join(settings.FIXTURES_DIR, "golden_dataset.csv"))
    assert os.path.exists(os.path.join(settings.TEMPLATES_DIR, "20261111_DAN_Mau-bao-cao-PMO.xlsx"))


def test_test_run_uses_isolated_database():
    assert "pmo_test_" in settings.DATABASE_URL
    assert "pmo_test_" in settings.UPLOADS_DIR

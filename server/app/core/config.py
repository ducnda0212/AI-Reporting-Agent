from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVER_DIR / ".env", extra="ignore")

    STORAGE_DIR: str = str(SERVER_DIR / "storage")
    FIXTURES_DIR: str = ""
    TEMPLATES_DIR: str = ""
    UPLOADS_DIR: str = ""
    EXPORTS_DIR: str = ""
    DATABASE_URL: str = ""
    DEFAULT_CYCLE_ID: str = ""  # empty = follow today; set to pin a cycle
    AI_SERVICE_URL: str = "http://localhost:8001/api/v1"
    MAX_UPLOAD_MB: int = 50

    @model_validator(mode="after")
    def _derive_paths(self):
        s = Path(self.STORAGE_DIR)
        self.FIXTURES_DIR = self.FIXTURES_DIR or str(s / "fixtures")
        self.TEMPLATES_DIR = self.TEMPLATES_DIR or str(s / "templates")
        self.UPLOADS_DIR = self.UPLOADS_DIR or str(s / "uploads")
        self.EXPORTS_DIR = self.EXPORTS_DIR or str(s / "exports")
        self.DATABASE_URL = self.DATABASE_URL or f"sqlite:///{(s / 'pmo_reporting.db').as_posix()}"
        return self


settings = Settings()

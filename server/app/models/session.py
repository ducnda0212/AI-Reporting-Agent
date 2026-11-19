from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from server.app.models.base import Base


class IngestSession(Base):
    """One processed upload: cached API response + pre-override rows for the next diff."""
    __tablename__ = "ingest_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    cycle_id: Mapped[str] = mapped_column(String, index=True)
    file_id: Mapped[int] = mapped_column(Integer, index=True)
    headers_json: Mapped[str] = mapped_column(Text)
    source_rows_json: Mapped[str] = mapped_column(Text)
    response_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

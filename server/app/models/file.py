from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[str] = mapped_column(String, index=True)
    original_name: Mapped[str] = mapped_column(String)
    stored_path: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    col_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="parsed")  # parsed|applied|superseded|failed
    uploaded_by: Mapped[str] = mapped_column(String, default="local")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

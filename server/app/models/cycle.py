from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from server.app.models.base import Base


class ReportingCycle(Base):
    __tablename__ = "reporting_cycles"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. 2026_11_w3
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    weeks_json: Mapped[str] = mapped_column(String, default="[]")  # week boundaries (JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)

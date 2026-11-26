from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from server.app.models.base import Base


class MappingConfig(Base):
    """Editable Jira -> 49-column mapping (source columns + status/progress/phase value maps)."""
    __tablename__ = "mapping_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. map_default_pmo_49col
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="active")  # active | draft | archived
    version: Mapped[int] = mapped_column(Integer, default=1)
    columns_json: Mapped[str] = mapped_column(Text)  # list[MappingColumnDef]
    value_mappings_json: Mapped[str] = mapped_column(Text)  # {status_map, progress_map, phase_map}
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    created_by: Mapped[str] = mapped_column(String, default="PMO System")

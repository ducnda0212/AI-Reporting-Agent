from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MasterCatalogItem(Base):
    __tablename__ = "master_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ma_da: Mapped[str] = mapped_column(String, index=True)
    mang_viec: Mapped[str] = mapped_column(String, default="")
    template_row: Mapped[int | None] = mapped_column(Integer, nullable=True)

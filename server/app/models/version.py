from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from server.app.models.base import Base


class ReportVersion(Base):
    """Immutable locked report: the cell snapshot a PMO signed off for one week (v1, v2... per cycle month + week)."""
    __tablename__ = "report_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # ver_YYYY_MM_wN_vK
    session_id: Mapped[str] = mapped_column(String, index=True)
    cycle_id: Mapped[str] = mapped_column(String, index=True)
    cycle_month: Mapped[str] = mapped_column(String, index=True)  # YYYY_MM: keeps wk|v apart across months
    wk: Mapped[str] = mapped_column(String, index=True)
    version_no: Mapped[int] = mapped_column(Integer)
    locked_by: Mapped[str] = mapped_column(String)
    locked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    at_label: Mapped[str] = mapped_column(String, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    file_name: Mapped[str] = mapped_column(String, default="")
    exported_file: Mapped[str | None] = mapped_column(String, nullable=True)
    export_path: Mapped[str | None] = mapped_column(String, nullable=True)
    snap_json: Mapped[str] = mapped_column(Text)  # {"ma|field": value}
    raw_notes_json: Mapped[str] = mapped_column(Text, default="{}")  # {ma: note without the "sửa tay" suffix}
    fmt_json: Mapped[str] = mapped_column(Text, default="{}")  # {"ma|field": CellFormat}
    wrap_json: Mapped[str] = mapped_column(Text, default="{}")
    hidden_json: Mapped[str] = mapped_column(Text, default="{}")
    stats_json: Mapped[str] = mapped_column(Text, default="{}")
    changes_json: Mapped[str] = mapped_column(Text, default="[]")  # [[ma, column, old, new]]
    edits_json: Mapped[str] = mapped_column(Text, default="[]")  # [{t, day, a, o, d}]

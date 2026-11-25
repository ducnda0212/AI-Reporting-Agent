from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
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
    baseline_session_id: Mapped[str | None] = mapped_column(String, nullable=True)  # previous upload of the cycle: the diff base
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class SessionDraft(Base):
    """Working copy of a session: current rows, manual overrides and the change log (one per session)."""
    __tablename__ = "session_drafts"

    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    cycle_id: Mapped[str] = mapped_column(String, index=True)
    mapping_id: Mapped[str | None] = mapped_column(String, nullable=True)
    rows_json: Mapped[str] = mapped_column(Text)
    overrides_json: Mapped[str] = mapped_column(Text)  # {ma: {field: value}}
    audit_logs_json: Mapped[str] = mapped_column(Text)  # [{t, day, seq, a, o, d, r}] = client LogEntry
    fmt_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}")  # {"i|field": CellFormat}
    wrap_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}")
    touched_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}")
    hidden_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}")
    pin_viec: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    ex_cols: Mapped[str] = mapped_column(String, default="vis", server_default="vis")
    lock_by: Mapped[str] = mapped_column(String, default="Khuê", server_default="Khuê")
    log_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    lock_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

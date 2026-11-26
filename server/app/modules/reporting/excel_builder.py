import json
import re
from copy import copy
from datetime import date, datetime
from pathlib import Path
from typing import Literal

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import column_index_from_string

from server.app.core.config import settings
from server.app.models.version import ReportVersion
from server.app.schemas.row import COLUMN_FIELDS

SHEET = "Mẫu báo cáo"
DEFAULT_TEMPLATE = "20261111_DAN_Mau-bao-cao-PMO.xlsx"
FIRST_ROW, CATALOG_LAST_ROW = 2, 69  # B2:B69 hold the catalog codes; new codes go below
WEEK_FIRST_COL = column_index_from_string("AL")  # AL..AW = 4 blocks x (ht, kh, vd)
WRAP_BY_DEFAULT = {"D", "E", "K", "N", *(l for l, f in COLUMN_FIELDS.items() if column_index_from_string(l) >= WEEK_FIRST_COL)}
DATE_FIELDS = {"start", "end"}
_FIELD_LETTER = {f: l for l, f in COLUMN_FIELDS.items()}
_CYCLE = re.compile(r"(\d{4})_(\d{2})")


def sanitize_export_filename(name: str | None, fallback: str) -> str:
    base = (name or "").replace("\\", "/").split("/")[-1].replace("..", "").strip()
    base = base or fallback
    return base if base.lower().endswith(".xlsx") else base + ".xlsx"


def resolve_template_path(cycle_id: str) -> Path:
    templates = Path(settings.TEMPLATES_DIR)
    m = _CYCLE.match(cycle_id)
    month_template = templates / f"template_{m[1]}_{m[2]}.xlsx" if m else None
    return month_template if month_template and month_template.exists() else templates / DEFAULT_TEMPLATE


def _to_date(text: str) -> date | str:
    try:
        return datetime.strptime(text, "%d/%m/%Y").date()
    except ValueError:
        return text  # shortcut: unparsable text stays text, upgrade if Jira ever sends other date formats


def _put(ws, row: int, letter: str, fid: str, value, fmt: dict, wrap: dict, key: str) -> None:
    cell = ws[f"{letter}{row}"]
    if fid in DATE_FIELDS and isinstance(value, str) and value:
        value = _to_date(value)
        if isinstance(value, date):
            cell.number_format = "d/m/yyyy"
    cell.value = value
    f = fmt.get(key) or {}
    if f.get("b") or f.get("i") or f.get("u") or f.get("s") or f.get("color"):
        font = copy(cell.font)
        font.b, font.i = f.get("b") or font.b, f.get("i") or font.i
        font.u = "single" if f.get("u") else font.u
        font.strike = f.get("s") or font.strike
        if f.get("color"):
            font.color = f["color"].lstrip("#")
        cell.font = font
    if f.get("fill"):
        cell.fill = PatternFill("solid", fgColor=f["fill"].lstrip("#"))
    al = copy(cell.alignment)
    al.horizontal, al.vertical = f.get("ha") or al.horizontal, {"middle": "center"}.get(f.get("va"), f.get("va")) or al.vertical
    al.wrap_text = wrap.get(key, True if letter in WRAP_BY_DEFAULT else al.wrap_text)
    cell.alignment = al


def _catalog_rows(ws) -> tuple[dict[str, int], int]:
    """code -> first template row (II.D.2.1 appears twice: first wins), and the last occupied row."""
    rows: dict[str, int] = {}
    last = CATALOG_LAST_ROW
    for r in range(FIRST_ROW, ws.max_row + 1):
        code = ws.cell(r, 2).value
        if code:
            rows.setdefault(str(code), r)
            last = max(last, r)
    return rows, last


def build_excel_from_version(
    version: ReportVersion, ex_cols: Literal["vis", "all"] = "vis", hidden: dict[str, bool] | None = None,
    only_current_week: bool = True, append_override_note: bool = True, file_name: str | None = None,
) -> tuple[Path, str]:
    """Fill the PMO master template with a locked version; returns (saved path, download file name)."""
    snap, raw_notes = json.loads(version.snap_json), json.loads(version.raw_notes_json)
    fmt, wrap = json.loads(version.fmt_json), json.loads(version.wrap_json)
    hidden = json.loads(version.hidden_json) if hidden is None else hidden
    wb = openpyxl.load_workbook(resolve_template_path(version.cycle_id))
    ws = wb[SHEET]
    wb.active = wb.worksheets.index(ws)
    rows, last = _catalog_rows(ws)
    cur_block = int(version.wk[1]) - 1
    for ma in dict.fromkeys(k.partition("|")[0] for k in snap):
        row = rows.get(ma)
        if row is None:  # a code outside the template: append below the last occupied row
            last += 1
            row = rows[ma] = last
            for c in range(1, 50):
                ws.cell(row, c)._style = copy(ws.cell(FIRST_ROW, c)._style)
            ws.cell(row, 1).value, ws.cell(row, 2).value = snap.get(f"{ma}|mang"), ma
        for letter, fid in COLUMN_FIELDS.items():
            idx, key = column_index_from_string(letter), f"{ma}|{fid}"
            if fid == "x" or idx < 3:
                continue
            if idx >= WEEK_FIRST_COL:
                if only_current_week and (idx - WEEK_FIRST_COL) // 3 != cur_block:
                    continue
                value = snap.get(key)
            elif fid == "note" and not append_override_note:
                value = raw_notes.get(ma, "")
            elif key in snap:
                value = snap[key]
            else:
                continue
            _put(ws, row, letter, fid, value, fmt, wrap, key)
    for letter, fid in COLUMN_FIELDS.items():
        ws.column_dimensions[letter].hidden = ex_cols == "vis" and bool(hidden.get(fid)) and fid != "ma"
    when = version.locked_at or datetime.now()
    shown = sanitize_export_filename(file_name, f"{when:%Y%m%d}_DAN_Bao-cao-PMO_v{version.version_no}.xlsx")
    out_dir = Path(settings.EXPORTS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{version.id}_{datetime.now():%Y%m%d%H%M%S%f}.xlsx"
    wb.save(path)
    return path, shown

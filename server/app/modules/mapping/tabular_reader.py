"""Jira export bytes (CSV/TSV/TXT or XLSX/XLSM) -> cleaned table + header statistics."""
import io
import os
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime

import openpyxl

from app.modules.mapping.csv_cleaner import InvalidSchemaError, build_table, csv_rows

CSV_EXT = {".csv", ".tsv", ".txt"}
XLSX_EXT = {".xlsx", ".xlsm"}


class UnsupportedFormatError(ValueError):
    """Extension is not CSV/TSV/TXT/XLSX/XLSM (legacy binary .xls included)."""


@dataclass
class TabularResult:
    headers: list[str]  # unique (duplicates suffixed _0, _1 ...)
    records: list[dict[str, str]]
    skipped_empty_rows: int
    dup_groups: int  # header names that appear more than once
    dup_cols: int  # columns belonging to those names
    unique_raw_cols: list[str]  # ordered distinct header names (what the mapping dropdown offers)


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):  # M/D/Y: what parse_jira_date reads
        return v.strftime("%m/%d/%Y %H:%M")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _xlsx_rows(file_bytes: bytes):
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    except (zipfile.BadZipFile, KeyError, OSError) as e:
        raise InvalidSchemaError("E_FILE_INVALID_SCHEMA: không đọc được file Excel") from e
    try:
        return [[_cell(c) for c in row] for row in wb.worksheets[0].iter_rows(values_only=True)]
    finally:
        wb.close()


def _result(raw_headers, headers, records, skipped) -> TabularResult:
    dup = {h: n for h, n in Counter(raw_headers).items() if n > 1}
    return TabularResult(headers, records, skipped, len(dup), sum(dup.values()), list(dict.fromkeys(raw_headers)))


def clean_xlsx(file_bytes: bytes) -> TabularResult:
    return _result(*build_table(_xlsx_rows(file_bytes)))


def read_tabular(file_bytes: bytes, filename: str) -> TabularResult:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in XLSX_EXT:
        return clean_xlsx(file_bytes)
    if ext in CSV_EXT:
        return _result(*build_table(csv_rows(file_bytes)))
    raise UnsupportedFormatError("E_FILE_UNSUPPORTED_FORMAT: chỉ hỗ trợ .csv, .tsv, .txt, .xlsx, .xlsm (hãy lưu .xls sang .xlsx)")

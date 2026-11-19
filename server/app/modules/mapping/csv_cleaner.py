"""Decode a Jira CSV export: encoding, delimiter, duplicate headers, empty rows."""
import codecs
import csv
import io
import re
import unicodedata
from collections import Counter

from charset_normalizer import from_bytes

REQUIRED_ANY = (("Summary",), ("Issue key",))  # "Key" etc. are renamed by _canonical_headers


class InvalidSchemaError(ValueError):
    """File lacks the minimal Jira columns (Summary + Issue key/Key)."""


def decode_bytes(data: bytes) -> str:
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return unicodedata.normalize("NFC", data.decode("utf-16"))
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Vietnamese legacy export first: charset-normalizer misdetects short cp1258 as CJK.
        try:
            text = data.decode("cp1258")
        except UnicodeDecodeError:
            best = from_bytes(data).best()
            text = str(best) if best is not None else data.decode("latin-1")
    return unicodedata.normalize("NFC", text)  # cp1258 stores tones as combining marks


def _delimiter(text: str) -> str:
    # Header line only: data cells may be multiline and full of commas.
    head = text.split("\n", 1)[0]
    return max(",;\t", key=head.count)


# Dev_Alias_nhan_dien: a few exact-name aliases for the system fields the pipeline depends on.
_ALIASES = {
    "issue key": "Issue key", "key": "Issue key", "mã issue": "Issue key",
    "summary": "Summary", "tiêu đề": "Summary", "title": "Summary",
    "status": "Status", "trạng thái": "Status",
    "description": "Description", "mô tả": "Description",
    "assignee": "Assignee", "người thực hiện": "Assignee",
    "due date": "Due date", "ngày kết thúc": "Due date",
    "priority": "Priority", "độ ưu tiên": "Priority",
}


def _canonical_headers(raw: list[str]) -> list[str]:
    """Trim/collapse spaces, then rename alias headers unless the canonical column already exists."""
    names = [re.sub(r"\s+", " ", h.replace("﻿", "")).strip() for h in raw]
    taken = set(names)
    out = []
    for h in names:
        canon = _ALIASES.get(h.casefold())
        if canon and h != canon and canon not in taken:
            taken.add(canon)
            h = canon
        out.append(h)
    return out


def _unique_headers(raw: list[str]) -> list[str]:
    totals = Counter(raw)
    seen: Counter = Counter()
    out = []
    for h in raw:
        if totals[h] > 1:
            out.append(f"{h}_{seen[h]}")
            seen[h] += 1
        else:
            out.append(h)
    return out


def clean_csv(file_bytes: bytes) -> tuple[list[str], list[dict[str, str]], int]:
    text = decode_bytes(file_bytes).lstrip("\ufeff")
    rows = csv.reader(io.StringIO(text, newline=""), delimiter=_delimiter(text))
    raw_headers = next(rows, None)
    if not raw_headers:
        raise InvalidSchemaError("E_FILE_INVALID_SCHEMA: empty file")
    raw_headers = _canonical_headers(raw_headers)
    if not all(any(c in raw_headers for c in group) for group in REQUIRED_ANY):
        raise InvalidSchemaError("E_FILE_INVALID_SCHEMA: missing Summary / Issue key column")
    headers = _unique_headers(raw_headers)

    records: list[dict[str, str]] = []
    skipped = 0
    for cells in rows:
        if not cells:  # blank physical line
            continue
        if not any(c.strip() for c in cells):
            skipped += 1
            continue
        cells = cells + [""] * (len(headers) - len(cells))
        records.append(dict(zip(headers, (c.replace("\r\n", "\n").replace("\r", "\n") for c in cells))))
    return headers, records, skipped

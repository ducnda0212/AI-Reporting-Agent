"""Chữ từ nhận dạng giọng nói: đọc lại mã dự án người dùng nói ("i chấm a chấm một chấm một" -> "I.A.1.1").

Chỉ đổi những đoạn đúng dạng mã (các phần ngăn bằng "chấm"/"dot"/"."), phần còn lại giữ nguyên.
"""
from __future__ import annotations

import re

NUM = {'không': '0', 'một': '1', 'mốt': '1', 'hai': '2', 'ba': '3', 'bốn': '4', 'tư': '4', 'năm': '5', 'lăm': '5', 'sáu': '6', 'bảy': '7', 'bẩy': '7', 'tám': '8', 'chín': '9', 'mười': '10'}
SEP = r'(?:\s*(?:chấm|chấm\.|dot|\.)\s*)'
PART = r'(?:[ivx]{1,4}|[a-e]|\d{1,2}|' + '|'.join(NUM) + r')'
CODE = re.compile(r'(?<![\w.])(' + PART + r'(?:' + SEP + PART + r'){2,4})(?![\w])', re.I)
ROMAN = re.compile(r'^[ivx]{1,4}$', re.I)


def _part(p: str) -> str:
    p = p.strip().lower()
    if p in NUM:
        return NUM[p]
    return p.upper() if re.fullmatch(r'[a-z]+', p) else p


def normalize_codes(text: str) -> str:
    """Đổi các mã dự án đọc thành tiếng sang dạng chuẩn (viết hoa chữ, số Ả Rập, ngăn bằng dấu chấm)."""
    def fix(m: re.Match) -> str:
        parts = [p for p in re.split(SEP, m.group(1), flags=re.I) if p.strip()]
        out = [_part(p) for p in parts]
        # mã dự án bắt đầu bằng số La Mã/chữ cái; một chuỗi toàn số ("1.2.3", "nhu 3 chấm 5") là số liệu, không phải mã
        if not (ROMAN.match(out[0]) or re.fullmatch(r'[A-E]', out[0])):
            return m.group(0)
        return '.'.join(out)
    return CODE.sub(fix, text)

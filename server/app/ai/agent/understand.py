"""Hiểu cách người dùng gọi tên các thứ có trong FILE ĐÃ UPLOAD, trước khi chatbot đọc ý câu hỏi.

Người dùng không gõ đúng như trong bảng: gọi tên ("Hằng", "chị Hằng", "thanh hang"), trỏ lại ("cô ấy", "người đó"),
nói theo số ("bước 10") hay theo tiếng Việt ("ưu tiên cao"). Ở đây code đối chiếu với đúng các giá trị có trong file:
  - khớp MỘT giá trị  -> thay bằng giá trị đầy đủ, ghi lại để báo người dùng "Mình hiểu … là …";
  - khớp NHIỀU giá trị -> không đoán, hỏi lại kèm lựa chọn;
  - không khớp        -> để nguyên cho V-LLM đọc.
Tên người không bao giờ gửi cho AI ở bước này: mọi thứ chạy bằng code, câu đã thay vẫn được che tên như cũ.
"""
from __future__ import annotations

import re
import unicodedata

# Xưng hô đứng trước tên gọi ("chị Hằng", "a Bảo"): có nó thì một chữ cũng đủ chắc là tên người.
# Gõ có dấu phải đúng dấu ("Có bao nhiêu" không phải "cô Bảo"); gõ không dấu chỉ nhận xưng hô không trùng từ thường ("co", "ba", "a" thì trùng).
HONOR = {'anh', 'chị', 'cô', 'em', 'chú', 'bác', 'ông', 'bà', 'bạn', 'mr', 'ms', 'sếp'}
HONOR_PLAIN = {'anh', 'chi', 'em', 'chu', 'bac', 'ong', 'sep', 'mr', 'ms'}
# Đại từ trỏ lại người vừa nhắc. Không dấu chỉ nhận các cách chắc chắn ("co ay", "nguoi do"); "co y" (cố ý) không tính.
PERSON_REF = re.compile(r'(?<!\w)(?:(?:cô|anh|chị|ông|bà|em|bạn|chú|bác)\s+(?:ấy|ý|ta)|người\s+(?:đó|này|ấy|kia|vừa\s+rồi)'
                        r'|(?:co|anh|chi|ong|ba|em|chu|bac)\s+(?:ay|ta)|nguoi\s+(?:do|nay|ay|kia))(?!\w)', re.I)
PRONOUN_AFTER = {'ấy', 'ý', 'ta', 'ay'}
BLOCK_PREV = {'tieng', 'nuoc', 'nguoi', 'tinh', 'thanh', 'pho', 'song', 'nui', 'quan', 'huyen', 'cong', 'hang', 'nha'}
WORD = re.compile(r'[\wÀ-ỹ]+', re.U)


def _norm(s: str) -> str:
    s = unicodedata.normalize('NFD', (s or '').lower().replace('đ', 'd').replace('Đ', 'd'))
    return re.sub(r'\s+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


def _low(s: str) -> str:
    return unicodedata.normalize('NFC', s).lower()


# ---------- người ----------
def _aliases(full: str) -> list[tuple[list[str], bool]]:
    """Các cách gọi một người: (chữ của cách gọi, có phải một chữ không). Đủ họ tên, tên đệm + tên, tên."""
    w = full.split()
    out = [(w, False)]
    if len(w) >= 3:
        out.append((w[-2:], False))
    if len(w) >= 2:
        out.append((w[-1:], True))
    return out


def find_people(text: str, rows: list[dict]) -> list[dict]:
    """Các chỗ trong câu nhắc tới người phụ trách. Mỗi chỗ: {start, end, alias, names}; names > 1 là gọi tên trùng nhiều người.
    Luật cho cách gọi một chữ ("Hằng"): phải đúng dấu và viết hoa (không phải chữ đầu câu đứng trước "ấy"), hoặc có xưng hô đứng trước
    ("chị Hằng", "a bao"); nhờ vậy "mình", "anh ấy", "tiếng Việt", "hằng tuần" không bị coi là tên."""
    people = sorted({str(r.get('pic') or '').strip() for r in rows if str(r.get('pic') or '').strip()})
    toks = [(m.group(0), m.start(), m.end()) for m in WORD.finditer(text)]
    found: list[dict] = []
    taken: set[int] = set()
    # gom mọi cách gọi -> những người có cách gọi đó; cách gọi dài xét trước
    table: dict[tuple, dict] = {}
    for p in people:
        for words, single in _aliases(p):
            key = tuple(_norm(x) for x in words)
            e = table.setdefault(key, {'names': [], 'single': single, 'exact': set()})
            if p not in e['names']:
                e['names'].append(p)
            e['exact'].add(tuple(_low(x) for x in words))
    for key in sorted(table, key=len, reverse=True):
        e, n = table[key], len(key)
        for i in range(len(toks) - n + 1):
            span = range(i, i + n)
            if any(j in taken for j in span) or tuple(_norm(t[0]) for t in toks[i:i + n]) != key:
                continue
            if e['single'] and len(e['names']) >= 1:
                word = toks[i][0]
                prev_raw = _low(toks[i - 1][0]) if i > 0 else ''
                prev = _norm(prev_raw)
                nxt = _low(toks[i + 1][0]) if i + 1 < len(toks) else ''
                honor = prev_raw in HONOR or (prev_raw == prev and prev in HONOR_PLAIN and _norm(word) == _low(word))
                exact = (_low(word),) in e['exact']
                capital = word[:1].isupper() and exact and not (i == 0 and _low(word) in HONOR)   # "Anh có…" đầu câu có thể là xưng hô
                if prev in BLOCK_PREV:
                    continue   # "tiếng Việt", "nước Đức": từ thường, không phải tên
                if _low(word) in HONOR | HONOR_PLAIN and (nxt in PRONOUN_AFTER or (i + 1 < len(toks) and toks[i + 1][0][:1].isupper())):
                    continue   # "Anh ấy…", "anh Bảo": đây là xưng hô, không phải tên
                if not (honor or capital):
                    continue
                if nxt in PRONOUN_AFTER:
                    continue
            taken.update(span)
            found.append({'start': toks[i][1], 'end': toks[i + n - 1][2], 'alias': text[toks[i][1]:toks[i + n - 1][2]], 'names': list(e['names'])})
    return sorted(found, key=lambda x: x['start'])


def _sub(text: str, start: int, end: int, new: str) -> str:
    return text[:start] + new + text[end:]


def _person_from_history(history: list[dict], rows: list[dict]) -> str | None:
    """Người vừa nhắc: câu gần nhất (câu hỏi trước, rồi câu trả lời trước) có đúng một người. '' = có nhiều người, không đoán."""
    for h in reversed(history):
        for text in (h.get('q', ''), h.get('a', '')):
            names = list(dict.fromkeys(n for f in find_people(text, rows) if len(f['names']) == 1 for n in f['names']))
            if len(names) == 1:
                return names[0]
            if len(names) > 1:
                return ''
    return None


# ---------- giá trị của các cột ----------
PRIORITY_WORDS = {'cao': 'High', 'high': 'High', 'trung binh': 'Medium', 'vua': 'Medium', 'medium': 'Medium', 'thap': 'Low', 'low': 'Low'}
PRIORITY_RE = re.compile(r'(ưu\s+tiên|uu\s+tien)\s+(cao|trung\s+bình|trung\s+binh|vừa|vua|thấp|thap)(?!\w)', re.I)
STEP_RE = re.compile(r'(bước|buoc)\s+(\d{1,2})(?![\d.\w])', re.I)


def _priority(question: str, rows: list[dict], notes: list[dict]) -> str:
    have = {str(r.get('priority') or '').strip() for r in rows}
    def rep(m):
        val = PRIORITY_WORDS.get(_norm(m.group(2)))
        if val not in have:
            return m.group(0)
        notes.append({'cot': 'Ưu tiên', 'cach_goi': m.group(0), 'gia_tri': val})
        return f'{m.group(1)} {val}'
    return PRIORITY_RE.sub(rep, question)


def _step(question: str, rows: list[dict], notes: list[dict]) -> str:
    steps = sorted({str(r.get('step') or '').strip() for r in rows if str(r.get('step') or '').strip()})
    def rep(m):
        hit = [s for s in steps if re.match(rf'0*{int(m.group(2))}\s*[.)\-:]', s)]
        if len(hit) != 1:
            return m.group(0)
        notes.append({'cot': 'Bước', 'cach_goi': m.group(0), 'gia_tri': hit[0]})
        return f'{m.group(1)} {hit[0]}'
    return STEP_RE.sub(rep, question)


# ---------- gộp lại ----------
def resolve(question: str, rows: list[dict], history: list[dict]) -> dict:
    """Trả {'question': câu đã thay, 'notes': [{cot, cach_goi, gia_tri}], 'hoi_lai': None | {cau_hoi, lua_chon}}."""
    notes: list[dict] = []
    q = question
    # 1. "cô ấy / người đó" -> người vừa nhắc (chỉ khi câu chưa nêu người nào)
    if PERSON_REF.search(q) and not find_people(q, rows):
        who = _person_from_history(history, rows)
        if who:
            m = PERSON_REF.search(q)
            notes.append({'cot': 'Phụ trách', 'cach_goi': m.group(0), 'gia_tri': who})
            q = PERSON_REF.sub(who, q)
    # 2. tên gọi tắt -> đủ họ tên; trùng nhiều người thì hỏi lại
    for f in reversed(find_people(q, rows)):
        if len(f['names']) > 1:
            opts = [_sub(q, f['start'], f['end'], n) for n in f['names'][:3]]
            return {'question': q, 'notes': notes, 'hoi_lai': {'cau_hoi': f'Trong file có {len(f["names"])} người tên "{f["alias"]}": {", ".join(f["names"])}. Bạn hỏi về ai?', 'lua_chon': opts}}
        full = f['names'][0]
        if _norm(f['alias']) != _norm(full):
            # bỏ xưng hô đứng ngay trước ("chị Hằng" -> "Bùi Thanh Hằng")
            before = q[:f['start']]
            mh = re.search(r'(?<!\w)([\wÀ-ỹ]+)\s+$', before)
            start = mh.start(1) if mh and (_low(mh.group(1)) in HONOR or _low(mh.group(1)) in HONOR_PLAIN) else f['start']
            notes.append({'cot': 'Phụ trách', 'cach_goi': q[start:f['end']], 'gia_tri': full})
            q = _sub(q, start, f['end'], full)
    # 3. giá trị cột gọi theo cách khác
    q = _priority(q, rows, notes)
    q = _step(q, rows, notes)
    return {'question': q, 'notes': notes, 'hoi_lai': None}


def note_text(notes: list[dict]) -> str:
    """Một dòng báo người dùng code đã hiểu cách gọi thế nào, để họ sửa nếu sai."""
    if not notes:
        return ''
    parts = [f'"{n["cach_goi"]}" là {n["gia_tri"]}' for n in notes]
    return 'Mình hiểu ' + ', '.join(parts) + '.'

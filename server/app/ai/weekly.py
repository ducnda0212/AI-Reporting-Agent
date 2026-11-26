"""Tách dữ liệu một tuần từ Jira theo quy tắc, không cần AI.

Ô "Vấn đề, rủi ro và Đề xuất giải pháp" (AN/AQ/AT/AW) lấy theo thứ tự:
  1. Risk Notes có ngày trong tuần (bảng: Ngày · Mô tả issue/risk · Todo · PIC · Deadline)
  2. Dòng "Risk:/Issue:/Vướng:…" trong Comment của tuần
Sau đó quyết định AI cần làm gì (`need`):
  none   → đủ thông tin, không gọi AI
  action → có rủi ro nhưng thiếu đề xuất, AI chỉ gợi ý đề xuất
  full   → không có rủi ro ghi sẵn nhưng Progress Report có dấu hiệu (chậm, chờ, thiếu…) hoặc dự án đang trễ
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
RISK_RE = re.compile(r'^\s*[-*•]?\s*(risk|rủi ro|issue|vấn đề|vướng(?: mắc)?|blocker)\s*[:：]\s*(.+)$', re.I)
TODO_RE = re.compile(r'^\s*[-*•→>]*\s*(đề xuất|giải pháp|todo|action|hướng xử lý)\s*[:：]\s*(.+)$', re.I)
COMMENT_HEAD = re.compile(r'(?m)^(\d{1,2})/([A-Za-z]{3})/(\d{2,4}) \d{1,2}:\d{2}(?: [AP]M)?;[^;\n]*;')
SIGNAL_RE = re.compile(r'chậm|trễ|lùi|delay|chờ|đang đợi|thiếu|vướng|block|chặn|pending|tạm dừng|chưa có|chưa được|không kịp|rủi ro|risk|sự cố|lỗi nghiêm trọng', re.I)

NO_REPORT = 'Chưa có Progress Report tuần này — đề nghị PM cập nhật trước họp.'
NO_ISSUE = 'Không có vấn đề phát sinh trong tuần.'


def parse_date(s: str) -> date | None:
    s = (s or '').strip().strip('{}').strip()
    if not s:
        return None
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.match(r'^(\d{1,2})/([A-Za-z]{3})/(\d{2,4})', s)
        if m:
            d, mo, y = int(m.group(1)), MONTHS.get(m.group(2).lower(), 0), int(m.group(3))
        else:
            m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})', s)
            if not m:
                return None
            d, mo, y = map(int, m.groups())
    if y < 100:
        y += 2000
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def _clean(s: str) -> str:
    s = re.sub(r'\[([^\]|]+)\|[^\]]+\]', r'\1', s or '')          # [chữ|link] → chữ
    s = re.sub(r'\{\{([^}]*)\}\}', r'\1', s)
    s = s.replace('*', '').replace('\u00a0', ' ')
    lines = [re.sub(r'^\s*[-•#]+\s*', '', l).strip() for l in s.splitlines()]
    return '\n'.join(l for l in lines if l)


def parse_wiki_table(text: str) -> tuple[list[str], list[list[str]]]:
    """Bảng wiki Jira (||tiêu đề|| và |ô|) → (tiêu đề, các hàng). Ô được phép xuống dòng; giữ nguyên dấu | trong [chữ|link]."""
    if not text or '|' not in text:
        return [], []
    prot = re.sub(r'\[[^\]\n]*\]', lambda m: m.group(0).replace('|', '\x00'), text.replace('\r\n', '\n'))
    header: list[str] = []
    rows: list[str] = []
    for line in prot.split('\n'):
        if line.startswith('||'):
            header = [c.replace('\x00', '|') for c in line.strip().strip('|').split('||')]
            header = [_clean(h) for h in header]
        elif line.startswith('|'):
            rows.append(line)
        elif rows:
            rows[-1] += '\n' + line
    out = []
    for r in rows:
        body = r.strip()
        body = body[1:-1] if body.endswith('|') and len(body) > 1 else body[1:]
        out.append([c.replace('\x00', '|').strip() for c in body.split('|')])
    return header, out


def _col(header: list[str], *keys: str) -> int | None:
    for i, h in enumerate(header):
        low = h.lower()
        if any(k in low for k in keys):
            return i
    return None


@dataclass
class Item:
    risk: str
    todo: str = ''
    pic: str = ''
    deadline: str = ''
    day: str = ''
    source: str = ''

    def line(self) -> str:
        out = f'Rủi ro: {self.risk}'
        if self.todo:
            extra = ', '.join(x for x in [self.pic, f'hạn {self.deadline}' if self.deadline else ''] if x)
            out += f'\n→ Đề xuất: {self.todo}' + (f' ({extra})' if extra else '')
        return out


def _in(d: date | None, start: date | None, end: date | None) -> bool:
    return bool(d and start and end and start <= d <= end)


def risk_notes(text: str, start: date | None, end: date | None) -> tuple[list[Item], int]:
    """Các dòng Risk Notes có ngày trong tuần. Trả thêm số dòng có nội dung nhưng không rõ ngày (để báo cần rà)."""
    header, rows = parse_wiki_table(text)
    if not rows:
        return [], 0
    ci = {'day': _col(header, 'date', 'ngày'), 'risk': _col(header, 'mô tả', 'issue', 'risk', 'rủi ro', 'vấn đề'),
          'todo': _col(header, 'todo', 'giải pháp', 'đề xuất', 'action', 'xử lý'), 'pic': _col(header, 'pic', 'phụ trách', 'owner'),
          'deadline': _col(header, 'deadline', 'hạn', 'due')}
    if ci['risk'] is None:
        return [], 0
    get = lambda r, k: _clean(r[ci[k]]) if ci[k] is not None and ci[k] < len(r) else ''  # noqa: E731
    items, undated = [], 0
    for r in rows:
        risk = get(r, 'risk')
        if not risk:
            continue
        d = parse_date(get(r, 'day'))
        if not d:
            undated += 1
            continue
        if _in(d, start, end):
            items.append(Item(risk=risk.replace('\n', '; '), todo=get(r, 'todo').replace('\n', '; '), pic=get(r, 'pic'),
                              deadline=get(r, 'deadline'), day=d.isoformat(), source='Risk Notes'))
    return items, undated


def _blocks(body: str) -> list[Item]:
    """Trong một comment: mỗi dòng "Risk:/Issue:/Vướng:" mở một mục; dòng "→ …" theo sau là hệ quả; "Đề xuất:/Todo:" là đề xuất."""
    items: list[Item] = []
    for raw in (body or '').replace('\r', '').split('\n'):
        line = _clean(raw)
        if not line:
            continue
        m, t = RISK_RE.match(line), TODO_RE.match(line)
        if m:
            items.append(Item(risk=m.group(2).strip().rstrip('.'), source='Comment'))
        elif t and items:
            items[-1].todo = '; '.join(x for x in [items[-1].todo, t.group(2).strip().rstrip('.')] if x)
        elif items and re.match(r'^[→>]', line):
            items[-1].risk += '; ' + line.lstrip('→> ').rstrip('.')
    return items


def comments(raw: str, start: date | None, end: date | None) -> tuple[list[Item], bool]:
    """Mục rủi ro trong Comment. Comment gốc của Jira có ngày ở đầu → lọc theo tuần.
    Comment đã làm sạch (không có ngày) → vẫn lấy, đánh dấu `undated=True` để ghi vào căn cứ."""
    raw = raw or ''
    heads = list(COMMENT_HEAD.finditer(raw))
    if not heads:
        items = _blocks(raw)
        return items, bool(items)
    out: list[Item] = []
    for k, h in enumerate(heads):
        body = raw[h.end(): heads[k + 1].start() if k + 1 < len(heads) else len(raw)]
        inner = re.search(r'\{\{(\d{4}-\d{2}-\d{2})\}\}', body)
        d = parse_date(inner.group(1)) if inner else parse_date(h.group(0))
        if not _in(d, start, end):
            continue
        for it in _blocks(body):
            it.day = d.isoformat()
            out.append(it)
    return out, False


def signals(report: dict | None) -> list[str]:
    """Câu trong Progress Report của tuần có dấu hiệu vấn đề."""
    if not report:
        return []
    out = []
    for part in (report.get('done') or '', report.get('plan') or ''):
        for line in _clean(part).split('\n'):
            if SIGNAL_RE.search(line) and len(line) > 6:
                out.append(line[:300])
    return out[:6]


@dataclass
class WeekPlan:
    text: str                      # phần lấy từ dữ liệu, ghi thẳng vào ô ('' = chưa có gì)
    source: str                    # nguồn của phần đó
    need: str                      # none | action | full
    items: list[Item] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def plan_week(row: dict) -> WeekPlan:
    wk = row.get('week') or {}
    start, end = parse_date(wk.get('start') or ''), parse_date(wk.get('end') or '')
    report = row.get('weekReport')
    notes: list[str] = []

    items, undated = risk_notes(row.get('riskNotes') or '', start, end)
    if undated:
        notes.append(f'{undated} dòng Risk Notes không có ngày — chưa đưa vào, cần rà')
    src = 'Risk Notes' if items else ''
    if not items:
        items, loose = comments(row.get('commentRaw') or row.get('comment') or '', start, end)
        if items:
            src = 'Comment' + (' (không rõ ngày)' if loose else '')

    ev = signals(report)
    if items:
        need = 'action' if any(not it.todo for it in items) else 'none'
        return WeekPlan('\n'.join(it.line() for it in items), src, need, items, ev, notes)
    if not report:
        return WeekPlan(NO_REPORT, 'Progress Report', 'none', [], [], notes)
    if ev or row.get('late'):
        return WeekPlan('', '', 'full', [], ev, notes)
    return WeekPlan(NO_ISSUE, 'Progress Report', 'none', [], [], notes)


def rule_risk_level(row: dict, plan: WeekPlan) -> dict:
    """Mức rủi ro khi không gọi AI. Đây là gợi ý theo quy tắc, người rà vẫn quyết định."""
    late = bool(row.get('late'))
    if late:
        return {'text': 'Cao', 'why': 'Dự án đang chậm tiến độ hoặc quá hạn', 'by': 'rule'}
    if plan.items:
        return {'text': 'Trung bình', 'why': f'Có {len(plan.items)} rủi ro ghi trong {plan.source}', 'by': 'rule'}
    if not row.get('weekReport'):
        return {'text': 'Trung bình', 'why': 'Tuần này chưa có Progress Report', 'by': 'rule'}
    return {'text': 'Thấp', 'why': 'Đúng tiến độ, không ghi nhận rủi ro trong tuần', 'by': 'rule'}


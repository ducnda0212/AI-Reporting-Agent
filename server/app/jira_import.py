"""Đọc file Jira xuất ra (CSV hoặc XLSX): đếm cột, gộp cột trùng tên, lấy các trường cần cho báo cáo."""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from collections import OrderedDict

# Trường cần cho báo cáo -> các tên cột Jira có thể gặp (so khớp sau khi chuẩn hoá)
WANTED = OrderedDict([
    ('key', ['issue key', 'key']),
    ('summary', ['summary']),
    ('issueType', ['issue type']),
    ('status', ['status']),
    ('assignee', ['assignee']),
    ('reporter', ['reporter']),
    ('priority', ['priority']),
    ('labels', ['labels']),
    ('created', ['created']),
    ('updated', ['updated']),
    ('due', ['due date', 'duedate']),
    ('start', ['start date', 'custom field (start date)']),
    ('progress', ['custom field (progress)', 'custom field (progress %)', 'progress']),
    ('phase', ['custom field (phase)', 'phase']),
    ('progressReport', ['custom field (progress report)', 'progress report']),
    ('kpi', ['custom field (kpi)', 'kpi']),
    ('objective', ['custom field (objective)', 'objective', 'description']),
    ('po', ['custom field (po)', 'custom field (product owner)']),
    ('milestone', ['custom field (milestone)', 'milestone']),
    ('comment', ['comment']),
])
CODE_RE = re.compile(r'^\s*\[?((?:[IVX]+)\.[A-Z](?:\.\d+)+)\]?')


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'\s+', ' ', s).strip()


def _decode(data: bytes) -> str:
    for enc in ('utf-8-sig', 'cp1258', 'cp1252'):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', 'replace')


def read_table(data: bytes, filename: str) -> list[list[str]]:
    name = (filename or '').lower()
    if name.endswith(('.xlsx', '.xlsm')):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows = [['' if v is None else str(v) for v in r] for r in ws.iter_rows(values_only=True)]
        wb.close()
        return rows
    if name.endswith('.xls'):
        raise ValueError('File .xls (Excel cũ) chưa hỗ trợ. Lưu lại thành .xlsx hoặc xuất CSV từ Jira.')
    text = _decode(data)
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    return [r for r in csv.reader(io.StringIO(text), dialect)]


def parse(data: bytes, filename: str) -> dict:
    if not data:
        raise ValueError('File rỗng.')
    rows = read_table(data, filename)
    # bỏ dòng trống ở đầu
    while rows and not any(c.strip() for c in rows[0]):
        rows.pop(0)
    if len(rows) < 2:
        raise ValueError('Không thấy dòng dữ liệu nào dưới dòng tiêu đề.')
    header = [h.strip() for h in rows[0]]
    body = [r + [''] * (len(header) - len(r)) for r in rows[1:] if any(c.strip() for c in r)]

    groups: OrderedDict[str, list[int]] = OrderedDict()
    for i, h in enumerate(header):
        groups.setdefault(h or f'(cột trống {i + 1})', []).append(i)
    dup = {h: ix for h, ix in groups.items() if len(ix) > 1}
    empty_cols = [h for h, ix in groups.items() if all(not r[i].strip() for r in body for i in ix)]

    by_norm = {norm(h): h for h in groups}
    found: dict[str, str] = {}
    for fid, cands in WANTED.items():
        for c in cands:
            if c in by_norm:
                found[fid] = by_norm[c]
                break
    missing = [fid for fid in ('key', 'summary', 'status') if fid not in found]
    if 'key' in missing and 'summary' in missing:
        raise ValueError('Không giống file Jira: thiếu cột Issue key và Summary.')

    issues = []
    for r in body:
        it = {}
        for fid, h in found.items():
            vals = [r[i].strip() for i in groups[h] if r[i].strip()]
            it[fid] = vals if fid in ('labels', 'comment') else (vals[0] if vals else '')
        m = CODE_RE.match(it.get('summary', ''))
        it['code'] = m.group(1) if m else ''
        issues.append(it)

    no_code = [i.get('key') or i.get('summary', '')[:40] for i in issues if not i['code']]
    return {
        'fileName': filename,
        'issues': len(issues),
        'columns': len(header),
        'uniqueColumns': len(groups),
        'dupGroups': len(dup),
        'dupColumns': sum(len(v) for v in dup.values()),
        'emptyColumns': len(empty_cols),
        'mapped': found,
        'missing': missing,
        'projects': len({i['code'] for i in issues if i['code']}),
        'noCode': no_code,
        'statuses': sorted({i.get('status', '') for i in issues if i.get('status')}),
        'items': issues,
    }

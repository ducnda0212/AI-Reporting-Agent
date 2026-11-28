"""Chế độ trò chuyện (AI_AGENT_MODE=chat): V-LLM đọc bảng và cả cuộc trò chuyện như một trợ lý, tự quyết cần tra gì.

Khác chế độ tools (18 công cụ có khuôn sẵn): ở đây V-LLM
  - THẤY bảng: mỗi dự án một dòng gọn (mã, tên, nhóm, trạng thái, tiến độ, rủi ro, hạn, bước, ưu tiên, người phụ trách đã che tên,
    trích đoạn vấn đề và kế hoạch tuần này);
  - THẤY cả cuộc trò chuyện dưới dạng các tin nhắn thật;
  - có 3 công cụ TỔNG QUÁT để tự ghép, giống ChatGPT tự viết pandas:
      truy_van_bang  lọc theo cột bất kỳ, chọn cột muốn xem, đếm, nhóm, sắp xếp;
      tim_noi_dung   tìm theo nghĩa trong nội dung chữ (RAG);
      doc_du_an      đọc đầy đủ một dự án.
  - việc làm thay đổi bảng (sửa, soạn nháp, duyệt, đổi cách xem, chốt, hoàn tác) vẫn qua công cụ cũ, có bước xem trước.
Code vẫn giữ quyền tính và kiểm: mọi con số trong câu trả lời phải có trong kết quả công cụ (hoặc trong câu hỏi / ô chữ của dự án được nêu),
mọi mã dự án phải có trong bảng; sai thì nhắc V-LLM tra lại một lần, vẫn sai thì báo cảnh báo.
"""
from __future__ import annotations

import json
import re
from datetime import date, timedelta

from ..llm import VllmError, client
from ..settings import settings
from . import qa

MAX_STEPS = 6            # số lần V-LLM gọi công cụ trong một câu
TABLE_MAX_CHARS = 45000  # bảng gửi kèm; bảng lớn hơn thì bỏ trích đoạn chữ, rồi bớt dòng (vẫn tra được bằng công cụ)
SNIP_ISSUE, SNIP_PLAN = 160, 110
RESULT_MAX_ROWS = 60     # số dự án tối đa một lần truy_van_bang trả về
RESULT_TEXT = 500        # mỗi ô chữ trong kết quả truy vấn
HIST_TURNS = 8

# cột người dùng / V-LLM nói tới -> khoá trong dòng đã làm sạch, nhãn tiếng Việt
COLS = {
    'ma': ('code', 'Mã'), 'ten': ('name', 'Tên dự án'), 'nhom': ('group', 'Nhóm'), 'trang_thai': ('status', 'Trạng thái'),
    'tien_do': ('progress', 'Tiến độ'), 'rui_ro': ('risk', 'Mức độ rủi ro'), 'phu_trach': ('pic', 'Phụ trách'),
    'bat_dau': ('start', 'Bắt đầu'), 'han': ('end', 'Hạn'), 'buoc': ('step', 'Bước'), 'uu_tien': ('priority', 'Ưu tiên'),
    'tien_do_jira': ('jira_progress', 'Tiến độ ghi trên Jira'), 'muc_tieu': ('goal', 'Mục tiêu'), 'kpi': ('kpi', 'KPI'),
    'milestone': ('milestone', 'Milestone'), 'da_lam': ('done', 'Đã làm tuần này'), 'ke_hoach': ('plan', 'Kế hoạch tuần sau'),
    'van_de': ('issue', 'Vấn đề, rủi ro và đề xuất'), 'tuan_truoc': ('prev', 'Các tuần trước'), 'comment': ('comment', 'Comment'),
    'ghi_chu': ('note', 'Ghi chú'), 'subtask': ('subtasks', 'Subtask'), 'cho_duyet': ('pending', 'Có ô nháp AI chờ duyệt'),
    'so_ngay_den_han': ('_days', 'Số ngày còn đến hạn (âm = đã quá hạn; trống với dự án đã xong / huỷ)'),
}
TEXT_COLS = {'muc_tieu', 'kpi', 'milestone', 'da_lam', 'ke_hoach', 'van_de', 'tuan_truoc', 'comment', 'ghi_chu', 'subtask'}
OPS = ['=', '!=', 'co_chua', 'khong_chua', 'trong', 'khong_trong', '<', '<=', '>', '>=', 'thuoc']

COND = {'type': 'object', 'properties': {
    'cot': {'type': 'string', 'enum': list(COLS)},
    'phep': {'type': 'string', 'enum': OPS, 'description': '"=" "!=" so khớp giá trị (không phân biệt dấu, hoa thường); "co_chua"/"khong_chua" tìm chữ trong ô; '
             '"trong"/"khong_trong" ô trống hay có nội dung; "< <= > >=" cho han, bat_dau (ngày dd/mm/yyyy, "hom_nay", "hom_nay+14") và so_ngay_den_han; '
             '"thuoc" = một trong các giá trị, ngăn bằng dấu |'},
    'gia_tri': {'type': 'string'}}, 'required': ['cot', 'phep']}

TOOLS = [
    {'name': 'truy_van_bang', 'description': 'Tra bảng: lọc theo bất kỳ cột nào, chọn cột muốn xem, đếm, nhóm, sắp xếp. Dùng cho MỌI con số (bao nhiêu, mấy, tỉ lệ, nhiều nhất) '
     'và mọi danh sách theo điều kiện. Muốn xem nội dung một cột của nhiều dự án (vd vấn đề của từng dự án) thì đưa cột đó vào cot_xem và lọc khong_trong.',
     'parameters': {'type': 'object', 'properties': {
         'dieu_kien': {'type': 'array', 'items': COND, 'description': 'các điều kiện, tất cả phải đúng (AND). Bỏ trống = cả bảng'},
         'cot_xem': {'type': 'array', 'items': {'type': 'string', 'enum': list(COLS)}, 'description': 'cột muốn xem của mỗi dự án (mã và tên luôn có)'},
         'nhom_theo': {'type': 'string', 'enum': ['', *COLS], 'description': 'đếm số dự án theo giá trị của cột này'},
         'sap_xep': {'type': 'string', 'enum': ['', *COLS]}, 'giam_dan': {'type': 'boolean'},
         'gioi_han': {'type': 'integer', 'description': 'số dự án tối đa muốn xem, 0 = mặc định'}}}},
    {'name': 'tim_noi_dung', 'description': 'Tìm theo NGHĨA trong nội dung chữ của báo cáo (mục tiêu, KPI, đã làm, kế hoạch, vấn đề, comment, subtask, các tuần trước), '
     'khi người dùng hỏi về một chủ đề (GPU, chờ bảo mật, thiếu người…) mà cách viết trong báo cáo có thể khác câu hỏi.',
     'parameters': {'type': 'object', 'properties': {
         'chu_de': {'type': 'string'}, 'cach_noi_khac': {'type': 'array', 'maxItems': 2, 'items': {'type': 'string'}},
         'cot': {'type': 'array', 'items': {'type': 'string', 'enum': sorted(TEXT_COLS)}, 'description': 'chỉ tìm trong các cột này; bỏ trống = mọi cột chữ'}},
         'required': ['chu_de']}},
    {'name': 'doc_du_an', 'description': 'Đọc đầy đủ một dự án: mọi cột, nội dung chữ đầy đủ, các tuần trước, subtask, comment.',
     'parameters': {'type': 'object', 'properties': {'ma': {'type': 'string'}}, 'required': ['ma']}},
]
ACTION_TOOLS = ('sua_bang', 'soan_nhap', 'duyet_nhap', 'doi_cach_xem', 'chot_xuat', 'hoan_tac', 'soan_nhan_xet', 'kiem_tra_du_lieu',
                'giai_thich_cot', 'xep_uu_tien', 'du_an_cho_duyet', 'hoi_lai')

SYSTEM = """Bạn là trợ lý PMO, trò chuyện với người quản lý về bảng báo cáo tuần các dự án AI. Hôm nay là {today}. Tuần đang xem: {week}.
Bảng hiện tại ở dưới (mỗi dự án một dòng; ô chữ chỉ là trích đoạn). Tên người đã được thay bằng nhãn [Người N]: dùng đúng nhãn đó, không đoán tên thật.

Cách làm việc:
- Đọc ý người dùng như một trợ lý giỏi, dựa vào cả cuộc trò chuyện: "ý tôi là…", "còn cái kia", "cô ấy", "trong số đó" là nói tiếp câu trước.
- MỌI con số (bao nhiêu, mấy, tổng, tỉ lệ, nhiều nhất) phải lấy từ kết quả truy_van_bang. Không tự đếm trên bảng, kể cả khi thấy dễ.
- Danh sách theo điều kiện: dùng truy_van_bang. Hỏi về một chủ đề trong nội dung chữ: tim_noi_dung. Cần nội dung đầy đủ của một dự án: doc_du_an.
- Hạn: "đến hạn trong N ngày tới" = so_ngay_den_han >= 0 và <= N; "quá hạn" = so_ngay_den_han < 0. Cột này đã bỏ sẵn dự án đã xong / huỷ; đừng lọc theo cột han cho các câu này.
- Nếu kết quả công cụ rỗng hoặc lạ, tự thử cách khác (điều kiện khác, cột khác, tìm theo nghĩa) trước khi kết luận là không có.
- Người dùng muốn THAY ĐỔI bảng (sửa / gán / ghi giá trị, soạn nháp ô trống, duyệt nháp, ẩn hiện cột, chốt xuất, hoàn tác) hoặc nhờ viết nhận xét tuần,
  kiểm tra dữ liệu, giải thích cột, xếp ưu tiên khi thiếu nguồn lực: gọi đúng công cụ đó, không tự trả lời bằng chữ.
- Câu thật sự mơ hồ (không đoán được người dùng muốn gì kể cả khi đọc cả cuộc trò chuyện): gọi hoi_lai.

Cách trả lời (khi đã đủ thông tin, trả lời bằng chữ, không gọi công cụ):
- Tiếng Việt, thẳng vào điều được hỏi, ngắn gọn, chữ thường (không dùng ** hay # của markdown). Liệt kê thì mỗi dòng "- MÃ (tên ngắn): nội dung". Nêu mã dự án và giá trị ô đúng như trong bảng.
- Gọi công cụ bằng chức năng gọi công cụ, không viết lệnh gọi công cụ thành chữ trong câu trả lời.
- Danh sách dài thì nêu những dự án đáng chú ý nhất trước (chậm, rủi ro cao, sắp hạn) rồi nói còn bao nhiêu dự án khác.
- Chỉ nói điều có trong dữ liệu; không có thì nói rõ là không có. Có thể nêu một nhận xét ngắn nếu dữ liệu cho thấy điều đáng chú ý.
- Câu ngoài phạm vi báo cáo dự án: trả lời một câu lịch sự rằng bạn chỉ hỗ trợ về báo cáo này.
"""


def _today() -> date:
    return qa._today()


def _clip(s: str, n: int) -> str:
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    return s if len(s) <= n else s[:n - 1] + '…'


def _days(r: dict) -> int | None:
    if qa._norm(r.get('status') or '') in qa.FINISHED:   # đã xong / huỷ: không tính quá hạn hay sắp đến hạn (như cột Tiến độ trên giao diện)
        return None
    d = qa._date(r.get('end') or '')
    return (d - _today()).days if d else None


def _val(r: dict, col: str, m) -> object:
    key = COLS[col][0]
    if key == '_days':
        return _days(r)
    v = r.get(key)
    if key == 'pending':
        return 'có' if v else 'không'
    v = str(v or '')
    return m.mask(v) if key in ('pic', *[COLS[c][0] for c in TEXT_COLS]) else v


# ---------- bảng gửi kèm ----------
def table_text(rows: list[dict], m) -> str:
    head = 'mã | tên | nhóm | trạng thái | tiến độ | rủi ro | hạn | bước | ưu tiên | phụ trách | vấn đề (trích) | kế hoạch (trích)'
    def line(r, snip=True):
        parts = [r['code'], _clip(r['name'], 70), r['group'], r['status'], r['progress'], r['risk'], r['end'], _clip(r.get('step'), 40),
                 r.get('priority', ''), m.mask(r['pic'])]
        if snip:
            parts += [_clip(m.mask(r.get('issue', '')), SNIP_ISSUE), _clip(m.mask(r.get('plan', '')), SNIP_PLAN)]
        return ' | '.join(str(p or '-') for p in parts)
    for snip in (True, False):
        body = [line(r, snip) for r in rows]
        txt = '\n'.join([head if snip else head.rsplit(' | vấn đề', 1)[0], *body])
        if len(txt) <= TABLE_MAX_CHARS:
            return f'Bảng có {len(rows)} dự án.\n' + txt
    keep, size = [], 0
    for b in body:
        if size + len(b) > TABLE_MAX_CHARS:
            break
        keep.append(b)
        size += len(b) + 1
    return f'Bảng có {len(rows)} dự án, dưới đây chỉ hiện {len(keep)} dự án đầu; dùng truy_van_bang để tra phần còn lại.\n' + '\n'.join([head.rsplit(' | vấn đề', 1)[0], *keep])


# ---------- truy_van_bang ----------
def _date_arg(s: str) -> date | None:
    s = str(s or '').strip().lower().replace(' ', '')
    mt = re.fullmatch(r'hom_nay([+-]\d+)?', s)
    if mt:
        return _today() + timedelta(days=int(mt.group(1) or 0))
    return qa._date(s)


def _match(r: dict, c: dict, m) -> bool:
    col, op, raw = c.get('cot'), c.get('phep'), str(c.get('gia_tri') or '')
    if col not in COLS or op not in OPS:
        return True
    v = _val(r, col, m)
    if op == 'trong':
        return v in (None, '', 'không')
    if op == 'khong_trong':
        return v not in (None, '', 'không')
    if op in ('<', '<=', '>', '>='):
        if col == 'so_ngay_den_han':
            try:
                a, b = v, int(raw)
            except (TypeError, ValueError):
                return False
        else:
            a, b = qa._date(str(v or '')), _date_arg(raw)
        if a is None or b is None:
            return False
        return {'<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b}[op]
    nv, nraw = qa._norm(str(v or '')), qa._norm(raw)
    if op in ('co_chua', 'khong_chua'):
        hit = bool(nraw) and nraw in nv
        return hit if op == 'co_chua' else not hit
    wants = [qa._norm(x) for x in raw.split('|')] if op == 'thuoc' else [nraw]
    hit = any(w and (nv == w or (col not in TEXT_COLS and len(w) >= 3 and nv.startswith(w))) for w in wants)
    return not hit if op == '!=' else hit


def query_table(args: dict, rows: list[dict], m) -> dict:
    conds = [c for c in (args.get('dieu_kien') or []) if isinstance(c, dict)][:6]
    sel = [r for r in rows if all(_match(r, c, m) for c in conds)]
    out: dict = {'so_luong': len(sel), 'tong': len(rows), 'ty_le_phan_tram': round(100 * len(sel) / len(rows)) if rows else 0}
    if conds:
        out['dieu_kien'] = conds
    gb = args.get('nhom_theo') or ''
    if gb in COLS:
        cnt: dict = {}
        for r in sel:
            k = _val(r, gb, m)
            k = 'Chưa có' if k in (None, '') else str(k)
            cnt[k] = cnt.get(k, 0) + 1
        out['nhom_theo'] = COLS[gb][1]
        out['dem'] = dict(sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[:40])
    sk = args.get('sap_xep') or ''
    if sk in COLS:
        def key(r):
            v = _val(r, sk, m)
            if sk in ('han', 'bat_dau'):
                v = qa._date(str(v or ''))
            return (v is None or v == '', v if v is not None else 0)
        sel = sorted(sel, key=key, reverse=bool(args.get('giam_dan')))
        if args.get('giam_dan'):   # ô trống luôn ở cuối
            sel = [r for r in sel if not key(r)[0]] + [r for r in sel if key(r)[0]]
    lim = args.get('gioi_han') if isinstance(args.get('gioi_han'), int) and not isinstance(args.get('gioi_han'), bool) else 0
    n = min(len(sel), lim if 0 < lim <= RESULT_MAX_ROWS else RESULT_MAX_ROWS)
    cols = [c for c in dict.fromkeys(args.get('cot_xem') or []) if c in COLS and c not in ('ma', 'ten')][:6]
    if not cols and not gb:
        cols = ['tien_do', 'han']
    out['du_an'] = [{'ma': r['code'], 'ten': _clip(r['name'], 80),
                     **{c: (_clip(_val(r, c, m), RESULT_TEXT) if isinstance(_val(r, c, m), str) else _val(r, c, m)) for c in cols}} for r in sel[:n]] if (cols or not gb) else []
    if len(sel) > n and out['du_an']:
        out['con_lai'] = len(sel) - n
    return out


# ---------- chạy ----------
def _tool_in_text(content: str, names: set[str]) -> dict | None:
    """V-LLM đôi khi viết lệnh gọi công cụ thành chữ thay vì gọi thật, nhiều dạng: {"function": "x", "arguments": {...}},
    {"function": {"name": "x", "arguments": {...}}}, {"name": "x", "parameters": {...}}, có hoặc không bọc <tool_call>. Đọc lại thành lệnh gọi thật."""
    text = content or ''
    dec = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch != '{':
            continue
        try:
            obj, _ = dec.raw_decode(text[i:])
        except ValueError:
            continue
        if not isinstance(obj, dict):
            continue
        fn = obj.get('function')
        if isinstance(fn, dict):
            obj = fn
            fn = obj.get('name')
        name = fn if isinstance(fn, str) else obj.get('name')
        args = obj.get('arguments', obj.get('parameters', {}))
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except ValueError:
                args = {}
        if name in names and isinstance(args, dict):
            return {'id': 'text_call', 'name': name, 'arguments': args}
    return None

def _history_msgs(history: list[dict], m) -> list[dict]:
    out = []
    for h in history[-HIST_TURNS:]:
        q, a = str(h.get('q') or ''), str(h.get('a') or '')
        if q.startswith('(dòng đang chọn'):
            if h.get('codes'):
                out.append({'role': 'user', 'content': f"(Mình đang chọn dòng {', '.join(h['codes'])} trên bảng.)"})
                out.append({'role': 'assistant', 'content': 'Đã rõ.'})
            continue
        out.append({'role': 'user', 'content': m.mask(q)})
        out.append({'role': 'assistant', 'content': m.mask(a) or '(đã trả lời)'})
    return out


def _known_numbers(results: list, question: str, answer: str, rows: list[dict], m) -> set[str]:
    nums = qa._numbers(json.dumps(results, ensure_ascii=False)) | qa._numbers(question)
    codes = {r['code'] for r in rows}
    said = qa._norm(answer + ' ' + question)
    for r in rows:   # số nằm trong ô chữ của dự án được nêu (mã hoặc tên, trong câu hỏi hay câu trả lời) là trích dẫn, không phải tự đếm
        if r['code'] in answer or r['code'] in question or (len(r['name']) >= 12 and qa._norm(r['name']) in said):
            nums |= qa._numbers(json.dumps({k: v for k, v in r.items() if isinstance(v, str)}, ensure_ascii=False))
    for c in codes:
        nums |= qa._numbers(c)
    return nums


def check(answer: str, results: list, question: str, rows: list[dict], m) -> list[str]:
    problems = []
    known = {r['code'] for r in rows}
    for c in re.findall(r'(?<![\w.])(?:[IVX]+|x)\.[\w.]*\d', answer):
        if c not in known and not any(k.startswith(c + '.') for k in known):
            problems.append(f'mã {c} không có trong bảng')
    plain = re.sub(r'\d+/\d+(/\d+)?', ' ', answer)
    plain = re.sub(r'(?m)^\s*\d+[.)]\s', ' ', plain)                  # danh sách đánh số 1. 2. 3.
    plain = re.sub(r'(?i)(tuần|tuan|bước|buoc|nhóm|nhom)\s+\d+', ' ', plain)   # "tuần 4", "bước 10": tên gọi, không phải số liệu
    plain = re.sub(r'(?<![\w.])(?:[IVX]+|x)\.[\w.]*\d', ' ', plain)
    nums = _known_numbers(results, question, answer, rows, m)
    for n in qa._numbers(plain):
        if n not in nums:
            problems.append(f'con số {n} không có trong kết quả tra bảng')
    return problems


def run(question: str, rows: list[dict], timing: dict, history: list[dict], week: str = '') -> dict:
    """Trả {'kind': 'answer', 'answer', 'codes', 'facts', 'by', 'warnings'} hoặc {'kind': 'spec', 'spec'} (việc làm thay đổi bảng / công cụ cũ).
    Lỗi V-LLM thì ném VllmError để nơi gọi chuyển sang chế độ tools."""
    from . import tools as old
    m = qa._masker(rows)
    action_defs = [t for t in old.TOOLS if t['name'] in ACTION_TOOLS]
    system = SYSTEM.format(today=_today().strftime('%d/%m/%Y'), week=week or 'tuần hiện tại') + '\n' + table_text(rows, m)
    msgs = [{'role': 'system', 'content': system}, *_history_msgs(history, m), {'role': 'user', 'content': m.mask(question)[:800]}]
    results: list = []
    steps: list = []
    retried = False
    timing['routeMs'] = 0
    for _ in range(MAX_STEPS):
        r = client.chat_tools(msgs, [*TOOLS, *action_defs], max_tokens=900, model=settings.agent_model, tool_choice='auto')
        timing['routeMs'] += r['ms']
        if not r['tool_calls']:
            leaked = _tool_in_text(r['content'], {t['name'] for t in [*TOOLS, *action_defs]})
            if leaked:
                r = {**r, 'content': '', 'tool_calls': [leaked]}
                steps.append({'cong_cu': 'doc_lenh_viet_thanh_chu', 'ten': leaked['name']})
        if not r['tool_calls']:
            ans = re.sub(r'\*\*(.+?)\*\*|__(.+?)__', lambda x: x.group(1) or x.group(2), m.unmask(str(r['content'] or '').strip()))
            problems = check(ans, results, question, rows, m) if ans else ['AI không trả lời']
            if problems and not retried:
                retried = True
                first = (ans, problems)
                steps.append({'cong_cu': 'kiem_tra', 'loi': problems})
                msgs.append({'role': 'assistant', 'content': r['content'] or ''})
                msgs.append({'role': 'system', 'content': 'Kiểm tra tự động (người dùng không thấy tin này): ' + '; '.join(problems[:4])
                             + '. Hãy tra bảng bằng công cụ để có đúng số liệu, rồi viết lại câu trả lời cho CÂU HỎI GỐC của người dùng. Không nhắc tới việc kiểm tra này.'})
                continue
            if retried and problems and len(first[1]) < len(problems):
                ans, problems = first
            timing['cong_cu'] = steps
            codes = [c for c in dict.fromkeys(re.findall(r'(?<![\w.])(?:[IVX]+|x)\.[\w.]*\d', ans)) if c in {x['code'] for x in rows}]
            return {'kind': 'answer', 'answer': ans, 'codes': codes, 'by': r.get('model') or settings.agent_model, 'warnings': problems,
                    'facts': {'kieu': 'chat', 'cong_cu': [s['cong_cu'] for s in steps]}}
        call = r['tool_calls'][0]
        name, args = call['name'], call['arguments'] or {}
        msgs.append({'role': 'assistant', 'content': r['content'] or None, 'tool_calls': [{'id': call['id'], 'type': 'function',
                     'function': {'name': name, 'arguments': json.dumps(args, ensure_ascii=False)}}]})
        step = {'cong_cu': name, 'tham_so': args}
        if name in ACTION_TOOLS:
            if name == 'hoi_lai':
                ask = str(args.get('cau_hoi') or '').strip()
                if ask:
                    steps.append(step)
                    timing['cong_cu'] = steps
                    opts = [str(x).strip()[:120] for x in (args.get('lua_chon') or []) if str(x).strip()][:3]
                    return {'kind': 'spec', 'spec': {'query': 'unknown', 'field': '', 'value': '', 'hoi_lai': {'cau_hoi': ask[:300], 'lua_chon': opts}}}
            else:
                d, err = old._to_d(name, args, rows, question, qa._name_candidates(question, rows, m))
                if d is not None:
                    d.pop('_code', None)
                    spec = qa._from_ai(d, rows, question)
                    steps.append(step)
                    timing['cong_cu'] = steps
                    return {'kind': 'spec', 'spec': spec}
                res = {'loi': err}
        elif name == 'truy_van_bang':
            res = query_table(args, rows, m)
        elif name == 'tim_noi_dung':
            fields = [COLS[c][0] for c in (args.get('cot') or []) if c in TEXT_COLS]
            spec = {'query': 'search', 'field': '', 'value': str(args.get('chu_de') or ''), 'fields': fields,
                    'queries': qa._search_queries([args.get('chu_de'), *(args.get('cach_noi_khac') or [])], question)}
            res = qa.compute(spec, rows, str(args.get('chu_de') or question), m, timing)
        elif name == 'doc_du_an':
            code = str(args.get('ma') or '').strip()
            hit = qa._find_codes(code, rows) or ([qa._project_by_name(code, rows)] if qa._project_by_name(code, rows) else [])
            res = qa.compute({'query': 'project', 'field': '', 'value': hit[0]}, rows, question, m, timing) if hit else {'loi': f'không có dự án {code}'}
        else:
            res = {'loi': f'không có công cụ {name}'}
        results.append(res)
        step['ket_qua'] = 'co' if res and not res.get('loi') else 'rong'
        steps.append(step)
        msgs.append({'role': 'tool', 'tool_call_id': call['id'], 'content': json.dumps(res, ensure_ascii=False, default=str)[:12000]})
    timing['cong_cu'] = steps
    raise VllmError('V-LLM gọi công cụ quá nhiều lần mà chưa trả lời', 0, '')

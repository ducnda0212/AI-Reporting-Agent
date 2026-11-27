"""Chế độ công cụ (AI_AGENT_MODE=tools): V-LLM tự đọc câu, tự chọn công cụ, đọc kết quả rồi thử lại nếu sai — như ChatGPT/Claude, không phân loại vào danh sách loại việc cố định.
Code chỉ làm ba việc: (1) nói cho V-LLM biết công cụ nào có, giá trị nào hợp lệ; (2) tính số thật khi công cụ được gọi; (3) trả lỗi rõ ràng để V-LLM tự sửa.
Việc ghi bảng vẫn đi qua luồng xem trước → "Áp dụng" (công cụ sửa/soạn/duyệt chỉ báo ý định, không ghi gì)."""
from __future__ import annotations

import json

from ..llm import VllmError, client
from ..settings import settings
from . import qa

MAX_STEPS = 3
RESULT_CHARS = 2500   # phần số liệu trả lại cho V-LLM đọc (đủ để tự đánh giá kết quả rỗng / sai hướng)

_COT = {'type': 'string', 'enum': list(qa.FIELDS)}
TOOLS = [
    {'name': 'tong_quan', 'description': 'Số liệu tổng quan cả bảng tuần này: số dự án, chậm tiến độ, có nguy cơ chậm, đến hạn. Dùng khi hỏi chung về cả báo cáo, không nhắc dự án hay chủ đề nào.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'loc_du_an', 'description': 'Liệt kê / đếm / thống kê dự án theo điều kiện trên các cột Tiến độ, Trạng thái, Mức độ rủi ro, Nhóm, theo hạn, hoặc đếm theo từng giá trị của một cột. '
     'Giá trị phải là giá trị CÓ SẴN trong cột đó. KHÔNG dùng để tìm theo nội dung chữ (mục tiêu, KPI, vướng mắc): việc đó dùng tim_noi_dung.',
     'parameters': {'type': 'object', 'properties': {
         'dieu_kien': {'type': 'array', 'maxItems': 4, 'items': {'type': 'object', 'properties': {'cot': _COT, 'gia_tri': {'type': 'string'}, 'phu_dinh': {'type': 'boolean', 'description': 'true nếu là KHÔNG PHẢI / CHƯA giá trị đó'}}, 'required': ['cot', 'gia_tri']}},
         'han': {'type': 'string', 'enum': ['', 'da_qua_han', '7_ngay', '14_ngay', '30_ngay']},
         'sap_xep': {'type': 'string', 'enum': ['', *qa.SORTS]},
         'gioi_han': {'type': 'integer', 'description': 'số dự án muốn xem, 0 nếu không nêu'},
         'dem_theo': {'type': 'string', 'enum': ['', *qa.GROUP_BY[1:]], 'description': 'đếm theo từng giá trị của cột này'}}}},
    {'name': 'xem_du_an', 'description': 'Xem thông tin MỘT dự án cụ thể, theo mã hoặc theo tên (tên có thể viết thiếu, không dấu hoặc nói lái). Dùng khi người dùng đang nói về một dự án; '
     'xem danh sách "Dự án có tên gần nghĩa nhất với câu" để biết mã.',
     'parameters': {'type': 'object', 'properties': {'ma_hoac_ten': {'type': 'string'}, 'muc_chi_tiet': {'type': 'string', 'enum': ['ngan', 'vua', 'day_du']}}, 'required': ['ma_hoac_ten']}},
    {'name': 'tim_noi_dung', 'description': 'Tìm trong NỘI DUNG chữ của báo cáo (mục tiêu, KPI, milestone, công việc, kế hoạch, vấn đề / vướng mắc, comment) theo chủ đề; hoặc hỏi một ô cụ thể của một dự án.',
     'parameters': {'type': 'object', 'properties': {
         'chu_de': {'type': 'string'}, 'cach_noi_khac': {'type': 'array', 'maxItems': 2, 'items': {'type': 'string'}, 'description': 'đồng nghĩa, viết tắt, thuật ngữ thường gặp trong báo cáo'},
         'o_can_tim': {'type': 'array', 'items': {'type': 'string', 'enum': [k for k, _ in qa.CONTENT_FIELDS]}, 'description': 'chỉ tìm trong các ô này; bỏ trống = mọi ô'},
         'ma_du_an': {'type': 'string', 'description': 'nếu hỏi về một dự án cụ thể'}}, 'required': ['chu_de']}},
    {'name': 'xep_uu_tien', 'description': 'Gợi ý nên giữ / dừng / hoãn / cắt dự án nào khi thiếu nguồn lực.',
     'parameters': {'type': 'object', 'properties': {'gioi_han': {'type': 'integer'}}}},
    {'name': 'du_an_cho_duyet', 'description': 'Danh sách dự án có ô nháp AI đang chờ người duyệt.', 'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'sua_bang', 'description': 'Người dùng MUỐN ĐỔI giá trị trong bảng (đặt, ghi, sửa, cho, gán…, kể cả câu khẳng định "I.C.1.1 vẫn có nguy cơ chậm nha"). Chỉ báo ý định; bản xem trước sẽ do bước khác tạo, chưa ghi gì.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'soan_nhap', 'description': 'Người dùng nhờ AI gợi ý / soạn nháp cho các ô còn trống (vd mức rủi ro cho dự án chưa đánh giá). Chưa ghi gì.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'duyet_nhap', 'description': 'Người dùng muốn duyệt / chấp nhận nháp AI của một số dự án.', 'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'doi_cach_xem', 'description': 'Đổi cách xem bảng trên giao diện (ẩn / hiện cột, chỉ xem dòng còn lỗi, bỏ lọc), không lọc dữ liệu.',
     'parameters': {'type': 'object', 'properties': {'hanh_dong': {'type': 'string', 'enum': qa.VIEW_ACTIONS}, 'cot': {'type': 'string'}}, 'required': ['hanh_dong']}},
]
INTENT_TOOLS = {'sua_bang': 'edit', 'soan_nhap': 'draft', 'duyet_nhap': 'approve'}

SYSTEM = """Bạn là trợ lý PMO đọc bảng báo cáo dự án. Bạn không có số liệu trong đầu: mọi số liệu và nội dung phải lấy bằng công cụ, không đoán.
Cách làm: hiểu người dùng muốn gì (hỏi thông tin hay muốn đổi / soạn / duyệt / xem bảng) và họ đang nói về cái gì (một dự án cụ thể, một chủ đề / vấn đề, hay cả bảng), rồi gọi MỘT công cụ phù hợp.
Giá trị của các cột phải lấy trong danh sách "Giá trị hiện có". Nếu công cụ báo lỗi hoặc kết quả rỗng, đọc lời nhắc và thử cách khác (đúng công cụ, đúng giá trị, cách nói khác); đừng lặp lại lệnh cũ.
Câu chào hoặc không liên quan bảng báo cáo: trả lời ngắn bằng tiếng Việt, không gọi công cụ. Tiếng Việt, không dùng ký hiệu markdown."""


def _empty(facts: dict) -> bool:
    k = facts.get('kieu')
    if k in ('filter', 'analyze'):
        return not (facts.get('khop') and facts.get('so_luong'))
    if k == 'search':
        return not facts.get('tim_thay')
    if k == 'project':
        return not facts.get('tim_thay')
    return False


def _to_d(name: str, a: dict, rows: list[dict], question: str, cands: list[dict]) -> tuple[dict | None, str]:
    """Đổi lời gọi công cụ thành dạng V-LLM-router đã có (để dùng lại toàn bộ bước kiểm tra). Trả (d, lỗi); lỗi viết để V-LLM đọc và tự sửa."""
    if name == 'tong_quan':
        return {'query': 'summary'}, ''
    if name == 'du_an_cho_duyet':
        return {'query': 'pending'}, ''
    if name == 'xep_uu_tien':
        return {'query': 'prioritize', 'limit': a.get('gioi_han') if isinstance(a.get('gioi_han'), int) else 0}, ''
    if name in INTENT_TOOLS:
        return {'query': INTENT_TOOLS[name]}, ''
    if name == 'doi_cach_xem':
        return {'query': 'view', 'view_action': a.get('hanh_dong'), 'column': a.get('cot') or ''}, ''
    if name == 'loc_du_an':
        conds = []
        for c in a.get('dieu_kien') or []:
            if not isinstance(c, dict) or c.get('cot') not in qa.FIELDS:
                return None, f'cot phải là một trong {list(qa.FIELDS)}'
            val = qa._resolve(rows, qa.FIELDS[c['cot']], str(c.get('gia_tri') or ''))
            if val is None:
                have = qa._values(rows, qa.FIELDS[c['cot']])
                return None, (f"Cột {c['cot']} không có giá trị '{c.get('gia_tri')}'. Giá trị có: {have}. Nếu người dùng hỏi về NỘI DUNG chữ / chủ đề (không phải giá trị của cột) "
                              'thì dùng tim_noi_dung; nếu nói về một dự án cụ thể thì dùng xem_du_an.')
            conds.append({'field': c['cot'], 'value': val, **({'negate': True} if c.get('phu_dinh') is True else {})})
        d = {'query': 'analyze', 'filters': conds, 'group_by': a.get('dem_theo') or '', 'sort': a.get('sap_xep') or '', 'limit': a.get('gioi_han') if isinstance(a.get('gioi_han'), int) else 0,
             'due': a.get('han') or '', 'list_each': False}
        if len(conds) == 1 and not conds[0].get('negate') and not (d['group_by'] or d['sort'] or d['limit'] or d['due']):
            d = {'query': 'filter', 'field': conds[0]['field'], 'value': conds[0]['value']}
        return d, ''
    if name == 'xem_du_an':
        ref = str(a.get('ma_hoac_ten') or '').strip()
        codes = qa._find_codes(ref, rows)
        code = codes[0] if len(codes) == 1 else (qa._project_by_name(ref, rows) or (ref if ref in {c['ma'] for c in cands} else None))
        if not code:
            return None, f"Không tìm thấy dự án '{ref}'. Dự án có tên gần nghĩa nhất: {cands}. Chọn mã trong danh sách nếu đúng, hoặc dùng tim_noi_dung nếu người dùng hỏi về chủ đề."
        return {'query': 'project', 'value': code, 'detail': a.get('muc_chi_tiet') or ''}, ''
    if name == 'tim_noi_dung':
        topic = str(a.get('chu_de') or '').strip()
        if not topic:
            return None, 'thiếu chu_de'
        fields = [f for f in (a.get('o_can_tim') or []) if f in {k for k, _ in qa.CONTENT_FIELDS}]
        d = {'query': 'search', 'value': topic, 'search_queries': [topic, *[str(x) for x in (a.get('cach_noi_khac') or [])]], 'fields': fields}
        code = str(a.get('ma_du_an') or '').strip()
        if code in {r['code'] for r in rows}:
            d['_code'] = code
        return d, ''
    return None, f'không có công cụ tên {name}'


def run(question: str, rows: list[dict], timing: dict, history: list[dict]) -> tuple[dict, str, dict | None]:
    """Trả (spec, routedBy, facts). facts = None khi công cụ chỉ báo ý định (sửa/soạn/duyệt/xem) hoặc câu chào."""
    m = qa._masker(rows)
    vals = {k: qa._values(rows, qa.FIELDS[k]) for k in qa.FIELDS}
    cands = qa._name_candidates(question, rows, m)
    ctx = [{'cau_truoc': m.mask(h['q']), 'ma_du_an_vua_nhac': h['codes'], 'tra_loi': m.mask(h.get('a', ''))} for h in history]
    user = ('Giá trị hiện có trong bảng:\n' + json.dumps(vals, ensure_ascii=False)
            + '\nDự án có tên gần nghĩa nhất với câu (hệ thống tìm sẵn, chưa chắc người dùng nhắc đến):\n' + json.dumps(cands, ensure_ascii=False)
            + ('\nCác câu trước:\n' + json.dumps(ctx, ensure_ascii=False) if ctx else '') + '\nCâu của người dùng: ' + m.mask(question)[:500])
    msgs = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}]
    steps, last = [], None
    timing['routeMs'] = 0
    for _ in range(MAX_STEPS):
        try:
            r = client.chat_tools(msgs, TOOLS, max_tokens=400, model=settings.agent_model)
        except VllmError as e:
            timing['error'] = str(e)
            return {'query': 'unknown', 'field': '', 'value': ''}, 'rule', None
        timing['routeMs'] += r['ms']
        if not r['tool_calls']:
            break
        call = r['tool_calls'][0]
        msgs.append({'role': 'assistant', 'content': r['content'] or None, 'tool_calls': [{'id': call['id'], 'type': 'function', 'function': {'name': call['name'], 'arguments': json.dumps(call['arguments'], ensure_ascii=False)}}]})
        d, err = _to_d(call['name'], call['arguments'], rows, question, cands)
        step = {'cong_cu': call['name'], 'tham_so': call['arguments']}
        if d is None:
            step['loi'] = err
            steps.append(step)
            msgs.append({'role': 'tool', 'tool_call_id': call['id'], 'content': 'LỖI: ' + err})
            continue
        code = d.pop('_code', '')
        spec = qa._from_ai(d, rows, question)
        if spec['query'] == 'search':
            fields = list(d.get('fields') or [])
            if code:
                spec = {**spec, 'code': code, 'fields': fields or [k for k, _ in qa.CONTENT_FIELDS]}
            else:
                spec = {**spec, 'fields': fields}   # V-LLM đã quyết ô nào: không dùng từ khoá đoán lại
                qs = qa._search_queries(d.get('search_queries'), question)
                if qs:
                    spec['queries'] = qs
        if d.get('detail') in ('ngan', 'vua', 'day_du'):
            spec['detail'] = d['detail']
        if spec['query'] in ('edit', 'draft', 'approve', 'view', 'unknown'):
            steps.append(step)
            timing['cong_cu'] = steps
            return spec, settings.agent_model, None
        facts = qa.compute(spec, rows, question, m, timing)
        last = (spec, facts)
        step['ket_qua'] = 'rong' if _empty(facts) else 'co'
        steps.append(step)
        if not _empty(facts):
            break
        msgs.append({'role': 'tool', 'tool_call_id': call['id'], 'content': 'Kết quả rỗng, không có dự án / đoạn nào khớp: ' + json.dumps(facts, ensure_ascii=False)[:RESULT_CHARS]
                     + '\nHãy kiểm tra lại cách hiểu câu hỏi và thử công cụ hoặc giá trị khác.'})
    timing['cong_cu'] = steps
    if last:
        return last[0], settings.agent_model, last[1]
    return {'query': 'help', 'field': '', 'value': ''}, settings.agent_model, None

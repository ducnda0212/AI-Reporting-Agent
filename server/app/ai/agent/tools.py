"""Chế độ công cụ (AI_AGENT_MODE=tools): V-LLM tự đọc câu, tự chọn công cụ, đọc kết quả rồi thử lại nếu sai — như ChatGPT/Claude, không phân loại vào danh sách loại việc cố định.
Code chỉ làm ba việc: (1) nói cho V-LLM biết công cụ nào có, giá trị nào hợp lệ; (2) tính số thật khi công cụ được gọi; (3) trả lỗi rõ ràng để V-LLM tự sửa.
Việc ghi bảng vẫn đi qua luồng xem trước → "Áp dụng" (công cụ sửa/soạn/duyệt chỉ báo ý định, không ghi gì)."""
from __future__ import annotations

import json

from ..llm import VllmError, client
from ..settings import settings
from . import qa

MAX_STEPS = 3
_choice = {'v': 'required'}   # ép V-LLM luôn chọn một công cụ (không quên gọi); nền tảng không nhận thì hạ về 'auto'
RESULT_CHARS = 2500   # phần số liệu trả lại cho V-LLM đọc (đủ để tự đánh giá kết quả rỗng / sai hướng)

_COT = {'type': 'string', 'enum': list(qa.FIELDS)}
TOOLS = [
    {'name': 'tong_quan', 'description': 'Số liệu tổng quan cả bảng tuần này: số dự án, chậm tiến độ, có nguy cơ chậm, đến hạn. Dùng khi hỏi chung về tình hình cả báo cáo (tuần này thế nào, có ổn không, tóm tắt), không nhắc dự án hay chủ đề nào. KHÔNG dùng khi người dùng nhờ SOẠN / VIẾT văn bản (dùng hoi_lai). KHÔNG dùng khi người dùng muốn NHÌN / XEM LẠI bảng (xem lại toàn bộ bảng, hiện hết các dòng): đó là đổi cách xem, dùng doi_cach_xem.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'loc_du_an', 'description': 'Liệt kê / đếm / thống kê dự án theo điều kiện trên các cột Tiến độ, Trạng thái, Mức độ rủi ro, Nhóm, Bước (giai đoạn vòng đời AI, chỉ khi hỏi "đang ở bước / giai đoạn nào"), Ưu tiên, theo hạn, hoặc đếm theo từng giá trị của một cột. '
     'Chỉ dùng khi người dùng HỎI / XEM danh sách hoặc số liệu. Giá trị phải là giá trị CÓ SẴN trong cột đó. KHÔNG dùng để tìm theo nội dung chữ (mục tiêu, KPI, vướng mắc): dùng tim_noi_dung. '
     'KHÔNG dùng khi người dùng đang GÁN / ĐỔI một giá trị cho các dự án đó (dùng sua_bang). Đếm theo từng giá trị của một cột (nhóm, tiến độ, người phụ trách…): dùng dem_theo; dem_theo = phu_trach chỉ khi hỏi về nhiều dự án / cả bảng. Hỏi về MỘT dự án cụ thể (kể cả "ai phụ trách I.A.1.1") thì dùng xem_du_an.',
     'parameters': {'type': 'object', 'properties': {
         'dieu_kien': {'type': 'array', 'maxItems': 4, 'items': {'type': 'object', 'properties': {'cot': _COT, 'gia_tri': {'type': 'string'}, 'phu_dinh': {'type': 'boolean', 'description': 'true nếu là KHÔNG PHẢI / CHƯA giá trị đó'}}, 'required': ['cot', 'gia_tri']}},
         'han': {'type': 'string', 'enum': ['', 'da_qua_han', '7_ngay', '14_ngay', '30_ngay']},
         'sap_xep': {'type': 'string', 'enum': ['', *qa.SORTS]},
         'gioi_han': {'type': 'integer', 'description': 'số dự án muốn xem, 0 nếu không nêu'},
         'dem_theo': {'type': 'string', 'enum': ['', *qa.GROUP_BY[1:]], 'description': 'đếm theo từng giá trị của cột này'}}}},
    {'name': 'xem_du_an', 'description': 'Xem thông tin MỘT dự án cụ thể, theo mã hoặc theo tên (tên có thể viết thiếu, không dấu hoặc nói lái). Dùng khi người dùng HỎI / MUỐN XEM một dự án; '
     'xem danh sách "Dự án có tên gần nghĩa nhất với câu" để biết mã. KHÔNG dùng khi người dùng đang GÁN / ĐỔI giá trị cho dự án đó (dùng sua_bang).',
     'parameters': {'type': 'object', 'properties': {'ma_hoac_ten': {'type': 'string'}, 'muc_chi_tiet': {'type': 'string', 'enum': ['ngan', 'vua', 'day_du']}}, 'required': ['ma_hoac_ten']}},
    {'name': 'tim_noi_dung', 'description': 'Tìm trong NỘI DUNG chữ của báo cáo (mục tiêu, KPI, milestone, công việc, kế hoạch, vấn đề / vướng mắc, comment, subtask) theo chủ đề; hoặc hỏi một ô cụ thể của một dự án. '
     'Dùng cho câu hỏi dự án nào ĐANG CHỜ / VƯỚNG / CẦN HỖ TRỢ / ĐỀ XUẤT / NHẮC TỚI điều gì ("dự án nào đang chờ rà soát bảo mật", "dự án nào cần PMO hỗ trợ escalate", "dự án nào nhắc tới GPU"), '
     'kể cả khi chữ đó trùng tên một bước hay một giá trị của cột: đó là nội dung báo cáo, không phải lọc theo cột.',
     'parameters': {'type': 'object', 'properties': {
         'chu_de': {'type': 'string'}, 'cach_noi_khac': {'type': 'array', 'maxItems': 2, 'items': {'type': 'string'}, 'description': 'đồng nghĩa, viết tắt, thuật ngữ thường gặp trong báo cáo'},
         'o_can_tim': {'type': 'array', 'items': {'type': 'string', 'enum': [k for k, _ in qa.CONTENT_FIELDS]}, 'description': 'chỉ tìm trong các ô này; bỏ trống = mọi ô'},
         'ma_du_an': {'type': 'string', 'description': 'nếu hỏi về một dự án cụ thể'}}, 'required': ['chu_de']}},
    {'name': 'xep_uu_tien', 'description': 'Gợi ý nên giữ / dừng / hoãn / cắt / tạm dừng dự án nào khi thiếu người hoặc nguồn lực.',
     'parameters': {'type': 'object', 'properties': {'gioi_han': {'type': 'integer'}}}},
    {'name': 'du_an_cho_duyet', 'description': 'Danh sách dự án có ô nháp AI đang chờ người duyệt.', 'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'sua_bang', 'description': 'Người dùng MUỐN GÁN / ĐỔI một giá trị trong bảng, chưa ghi gì (bước xem trước do nơi khác tạo). Nhận ra bằng: có một dự án (mã hoặc tên) hoặc một nhóm / điều kiện ("mấy dự án Voice", "dự án nào chậm thì…", "tất cả dự án") '
     'kèm MỘT GIÁ TRỊ MỚI cho một cột (tiến độ, rủi ro, trạng thái, note, ghi chú…) đi với động từ gán (cho, để, đặt, ghi, note, sửa, đổi, gán…) hoặc CÂU KHẲNG ĐỊNH không có từ hỏi ("I.C.1.1 vẫn có nguy cơ chậm nha", "td i.c.1.1 la cham", '
     '"i.a.1.1 note cho hop khoi"), kể cả viết tắt hoặc không dấu. Mẫu "cho / để / đặt + tên cột + giá trị" ("cho tiến độ có nguy cơ chậm") nghĩa là ĐẶT cột đó thành giá trị đó, không phải lọc dự án có giá trị đó. ĐIỀN / GÁN HÀNG LOẠT cũng là sửa: "điền các ô còn thiếu / còn trống / chưa có … thành X", "điền domain còn thiếu thành Food hết", "gán X cho mọi dự án chưa có nhóm" (tên cột có thể là tên tiếng Anh hoặc viết tắt: domain, nhóm, status, note, risk…; giá trị mới là một giá trị cụ thể như Food, Voice, Chậm tiến độ). Câu có từ hỏi (nào, bao nhiêu, ?, không) là hỏi, không phải sửa.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'soan_nhap', 'description': 'Người dùng nhờ AI điền nháp CÁC Ô CÒN TRỐNG trong bảng (Mức độ rủi ro, Vấn đề & rủi ro, Progress Report của từng dự án; "soạn nháp các ô trống", "AI viết nháp giúp tôi", kể cả không dấu). Chưa ghi gì. KHÔNG dùng khi nhờ viết nhận xét / đoạn tổng kết bằng chữ cho tuần (dùng soan_nhan_xet).',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'duyet_nhap', 'description': 'Người dùng NÓI RÕ bằng chữ duyệt / chấp nhận / áp dụng nháp AI. Câu đồng ý chung chung hoặc mơ hồ ("ok", "ừ", "làm tiếp đi") KHÔNG phải duyệt.', 'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'doi_cach_xem', 'description': 'Đổi cách XEM bảng trên giao diện, không trả số liệu: ẩn / hiện một cột ("ẩn cột note đi", kể cả không dấu), chỉ xem dòng còn lỗi, hoặc bỏ lọc để hiện lại toàn bộ bảng / mọi dòng ("cho tôi nhìn lại toàn bộ bảng", "xem lại hết", "hiện tất cả các dòng": muốn THẤY bảng, không hỏi số liệu).',
     'parameters': {'type': 'object', 'properties': {'hanh_dong': {'type': 'string', 'enum': qa.VIEW_ACTIONS, 'description': 'hide = ẩn cột; show = hiện cột; only_fix = chỉ xem dòng còn lỗi; show_all = bỏ lọc, hiện lại toàn bộ bảng'}, 'cot': {'type': 'string', 'description': 'tên cột (với hide / show)'}}, 'required': ['hanh_dong']}},
    {'name': 'gioi_thieu', 'description': 'CHỈ khi người dùng hỏi trợ lý làm được gì, có tính năng nào (vẽ biểu đồ, ma trận, xuất file…) hoặc cách dùng. Một mệnh lệnh làm việc cụ thể trên bảng (điền, đổi, gán, soạn…) KHÔNG phải câu hỏi về tính năng. Cũng dùng khi hỏi trợ lý là ai / là gì ("bạn là ai", "bạn là gì").', 'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'soan_nhan_xet', 'description': 'Người dùng nhờ SOẠN / VIẾT nhận xét PMO bằng chữ cho tuần (mọi câu có "nhận xét" + soạn/viết đều vào đây, KHÔNG phải soan_nhap): tình hình chung, dự án chậm, rủi ro cần chú ý ("soạn nhận xét PMO ngắn", "viết đoạn nhận xét tuần này", "tổng kết tuần bằng vài câu"). Trả một đoạn văn ngắn có tên dự án cụ thể, không vẽ thẻ hay biểu đồ. '
     'KHÔNG dùng khi chỉ hỏi số liệu hay xem tóm tắt (dùng tong_quan).',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'kiem_tra_du_lieu', 'description': 'Kiểm tra bảng còn thiếu hoặc mâu thuẫn gì trước khi chốt: ô rủi ro / tiến độ / nhóm còn trống, chậm tiến độ mà rủi ro thấp, quá hạn mà ghi đúng tiến độ, dự án chưa có hạn ("bảng còn thiếu gì", "kiểm tra giúp trước khi chốt", "có chỗ nào sai sai không", "đủ dữ liệu chưa"). Không sửa gì.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'giai_thich_cot', 'description': 'Giải thích MỘT cột của bảng: cột đó là gì, Agent hoặc người dùng có điền tay được không, được chọn những giá trị nào ("cột Domain điền được không", "Tiến độ có những giá trị nào", "cột này lấy từ đâu"). Không dùng để hỏi về giá trị của một dự án.',
     'parameters': {'type': 'object', 'properties': {'cot': {'type': 'string', 'description': 'Tên cột như người dùng gọi (vd Domain, Tiến độ, Note).'}}, 'required': ['cot']}},
    {'name': 'chot_xuat', 'description': 'Người dùng muốn CHỐT báo cáo và XUẤT file ("chốt báo cáo", "xuất file", "xuất báo cáo cho tuần này", "qua bước chốt"). Chỉ báo ý định: giao diện mở bước Chốt & xuất cho người dùng tự xác nhận.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'hoan_tac', 'description': 'Người dùng muốn HOÀN TÁC thay đổi vừa làm trên bảng ("hoàn tác", "undo", "quay lại như cũ", "khôi phục lần sửa vừa rồi"). Chỉ báo ý định; giao diện hướng dẫn và người dùng tự xác nhận.',
     'parameters': {'type': 'object', 'properties': {}}},
    {'name': 'hoi_lai', 'description': 'Hỏi lại người dùng. Dùng khi KHÔNG chắc người dùng muốn gì, hoặc khi họ nhờ một việc mà không công cụ nào làm đúng việc đó '
     '(ví dụ nhờ SOẠN / VIẾT một đoạn văn bản, email, nhận xét, báo cáo bằng chữ: các công cụ khác chỉ đọc số liệu hoặc đổi bảng, không viết văn bản). '
     'TUYỆT ĐỐI không thay bằng một công cụ khác chỉ để có gì đó trả lời (đừng đưa tóm tắt số liệu khi người dùng nhờ soạn văn bản). '
     'Câu hỏi ngắn, nói thẳng điều mình chưa làm được (nếu có) rồi gợi ý việc gần nhất làm được; kèm 2-3 lựa chọn là các lệnh hợp lệ của trợ lý (vd "Soạn nhận xét PMO ngắn cho tuần này", "Liệt kê dự án chậm"), không dùng lựa chọn "khác".',
     'parameters': {'type': 'object', 'properties': {'cau_hoi': {'type': 'string', 'description': 'Câu hỏi lại ngắn, tiếng Việt, xưng mình. Không liệt kê lựa chọn trong câu: lựa chọn đưa vào lua_chon.'},
                                                   'lua_chon': {'type': 'array', 'items': {'type': 'string'}, 'description': '2-3 cách hiểu / việc làm được, mỗi cái viết thành một câu người dùng có thể gõ lại.'}},
                    'required': ['cau_hoi']}},
    {'name': 'khong_lien_quan', 'description': 'CHỈ dùng khi chắc chắn câu không liên quan đến bảng dự án: chào, cảm ơn, chuyện ngoài lề không dính tới bảng (thời tiết, giá vàng, kể chuyện). Câu cụt không nói rõ làm gì ("ok", "làm tiếp đi") hoặc nhờ viết thứ liên quan tới báo cáo mà không công cụ nào viết được (email báo cáo…): dùng hoi_lai, không dùng công cụ này. Câu viết không dấu, viết tắt mà có thể là về bảng thì KHÔNG dùng công cụ này.',
     'parameters': {'type': 'object', 'properties': {}}},
]
INTENT_TOOLS_HELP = {'gioi_thieu': 'help'}
INTENT_TOOLS = {'sua_bang': 'edit', 'soan_nhap': 'draft', 'duyet_nhap': 'approve', 'khong_lien_quan': 'unknown'}

SYSTEM = """Bạn là trợ lý PMO đọc bảng báo cáo dự án. Bạn không có số liệu trong đầu: mọi số liệu và nội dung phải lấy bằng công cụ, không đoán.
Cách làm: hiểu người dùng muốn gì (hỏi thông tin hay muốn đổi / soạn / duyệt / xem bảng) và họ đang nói về cái gì (một dự án cụ thể, một chủ đề / vấn đề, hay cả bảng), rồi gọi MỘT công cụ phù hợp. LUÔN gọi một công cụ; câu chào, cảm ơn, ngoài lề thì gọi khong_lien_quan. Chưa rõ người dùng muốn gì, hoặc họ nhờ việc không công cụ nào làm đúng (soạn văn bản, viết email, nhận xét bằng chữ…) thì gọi hoi_lai: hỏi lại, đừng đoán và đừng đưa kết quả của việc khác.
Giá trị của các cột phải lấy trong danh sách "Giá trị hiện có". Nếu công cụ báo lỗi hoặc kết quả rỗng, đọc lời nhắc và thử cách khác (đúng công cụ, đúng giá trị, cách nói khác); đừng lặp lại lệnh cũ.
Người dùng hay gõ không dấu, viết tắt, câu cụt: đọc ý rồi chọn công cụ, đừng vội xếp vào khong_lien_quan. Phân biệt: nhờ VIẾT nhận xét / đoạn tổng kết tuần → soan_nhan_xet; nhờ điền nháp các ô còn trống trong bảng → soan_nhap. Chỉ đọc bảng: bạn không tự ghi bảng, việc đổi bảng chỉ báo ý định qua sua_bang / soan_nhap / duyet_nhap.
Ba trường hợp hay nhầm: (1) câu dạng "<điều kiện> thì <ghi / note / đặt / cho> <giá trị>" (vd "dự án nào chậm thì note chờ CBLD") là LỆNH gán giá trị cho các dự án thỏa điều kiện → sua_bang, KHÔNG phải loc_du_an; (2) "ai" viết không dấu thường là AI: "ai viet nhap giup t" = nhờ AI soạn nháp → soan_nhap, không hỏi lại; (3) câu ngắn nối tiếp ngay sau khi trợ lý vừa soạn nháp ("làm lại đi", "soạn tiếp các ô còn lại") → soan_nhap; còn câu chỉ đồng ý / cảm ơn ("ok", "ừ", "cảm ơn") không yêu cầu việc gì → khong_lien_quan, KHÔNG duyet_nhap."""


def _empty(facts: dict) -> bool:
    k = facts.get('kieu')
    if k in ('filter', 'analyze'):
        if facts.get('khop') and not facts.get('so_luong') and facts.get('so_du_an_khong_co_han'):
            return False   # xếp / lọc theo hạn mà các dự án chưa có ngày hạn: đó chính là câu trả lời, không đổi sang công cụ khác
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
    if name == 'soan_nhan_xet':
        return {'query': 'nhan_xet'}, ''
    if name == 'kiem_tra_du_lieu':
        return {'query': 'kiem_tra'}, ''
    if name == 'giai_thich_cot':
        return {'query': 'giai_thich_cot', 'column': str(a.get('cot') or '').strip()}, ''
    if name == 'chot_xuat':
        return {'query': 'export'}, ''
    if name == 'hoan_tac':
        return {'query': 'undo'}, ''
    if name == 'du_an_cho_duyet':
        return {'query': 'pending'}, ''
    if name == 'xep_uu_tien':
        return {'query': 'prioritize', 'limit': a.get('gioi_han') if isinstance(a.get('gioi_han'), int) else 0}, ''
    if name in INTENT_TOOLS or name in INTENT_TOOLS_HELP:
        return {'query': {**INTENT_TOOLS, **INTENT_TOOLS_HELP}[name]}, ''
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
    if qa.is_who(question):   # "bạn là ai": code trả lời ngay, không qua V-LLM nên không bị hiểu nhầm là câu ngoài lề
        timing['cong_cu'] = [{'cong_cu': 'gioi_thieu', 'ket_qua': 'co'}]
        return {'query': 'help', 'field': '', 'value': ''}, 'rule', None
    fix = qa.edit_follow_up(question, rows, history)
    if fix:   # "thôi bỏ I.A.1.1 ra" ngay sau khi Agent đề xuất sửa: soạn lại lệnh sửa, không mở xem dự án
        timing['cong_cu'] = [{'cong_cu': 'sua_bang', 'ket_qua': 'luat'}]
        return fix, 'rule', None
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
            try:
                r = client.chat_tools(msgs, TOOLS, max_tokens=400, model=settings.agent_model, tool_choice=_choice['v'])
            except VllmError as e:
                if _choice['v'] == 'required' and e.status in (400, 422):
                    _choice['v'] = 'auto'
                    r = client.chat_tools(msgs, TOOLS, max_tokens=400, model=settings.agent_model, tool_choice='auto')
                else:
                    raise
        except VllmError as e:
            timing['error'] = str(e)
            return {'query': 'unknown', 'field': '', 'value': ''}, 'rule', None
        timing['routeMs'] += r['ms']
        if not r['tool_calls']:
            break
        call = r['tool_calls'][0]
        if last and call['name'] in ('hoi_lai', 'khong_lien_quan') and last[0].get('query') == 'search':   # đã tìm nội dung mà không thấy: trả lời "không thấy" chứ không hỏi lại / coi là ngoài lề
            steps.append({'cong_cu': call['name'], 'tham_so': call['arguments'], 'bo_qua': 'dùng kết quả tìm rỗng'})
            timing['cong_cu'] = steps
            return last[0], settings.agent_model, last[1]
        msgs.append({'role': 'assistant', 'content': r['content'] or None, 'tool_calls': [{'id': call['id'], 'type': 'function', 'function': {'name': call['name'], 'arguments': json.dumps(call['arguments'], ensure_ascii=False)}}]})
        if call['name'] == 'hoi_lai':
            ask = str((call['arguments'] or {}).get('cau_hoi') or '').strip()
            opts = [str(x).strip() for x in ((call['arguments'] or {}).get('lua_chon') or []) if str(x).strip()][:3]
            if ask:
                steps.append({'cong_cu': 'hoi_lai', 'tham_so': call['arguments']})
                timing['cong_cu'] = steps
                return {'query': 'unknown', 'field': '', 'value': '', 'hoi_lai': {'cau_hoi': ask[:300], 'lua_chon': [o[:120] for o in opts]}}, settings.agent_model, None
            steps.append({'cong_cu': 'hoi_lai', 'tham_so': call['arguments'], 'loi': 'thiếu cau_hoi'})
            msgs.append({'role': 'tool', 'tool_call_id': call['id'], 'content': 'LỖI: thiếu cau_hoi'})
            continue
        d, err = _to_d(call['name'], call['arguments'], rows, question, cands)
        step = {'cong_cu': call['name'], 'tham_so': call['arguments']}
        if d is None:
            step['loi'] = err
            steps.append(step)
            msgs.append({'role': 'tool', 'tool_call_id': call['id'], 'content': 'LỖI: ' + err})
            continue
        code = d.pop('_code', '')
        if not code and d.get('query') == 'search':
            in_q = qa._find_codes(question, rows)
            code = in_q[0] if len(in_q) == 1 else ''   # câu nêu đúng một mã dự án: tìm trong ô của dự án đó
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
        if spec['query'] in ('edit', 'draft', 'approve', 'view', 'unknown', 'export', 'undo'):
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
    return {'query': 'unknown', 'field': '', 'value': ''}, settings.agent_model, None

"""Bộ câu KHÓ cho Agent: gõ không dấu, viết tắt, sai chính tả, câu cụt, nhiều cách nói, và NHỚ hội thoại (câu nối tiếp).

Chạy (ở thư mục server, đã mở venv):
    python -m evals.robust_eval                 # offline: kiểm tầng code
    python -m evals.robust_eval --mode live     # V-LLM thật: đo khả năng hiểu (cần AI_MODE=vllm)
    python -m evals.robust_eval --mode live --verbose
Phần 1: V-LLM đọc ý định (hỏi / sửa / soạn nháp / duyệt / đổi cách xem), có kèm các câu trước.
Phần 2: lệnh sửa nối tiếp ("cũng ghi vậy cho I.A.1.2", "đổi lại thành Cao") phải ra đúng ô.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from server.app.ai.agent import edit as agent_edit, qa as agent  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402
from evals.intent_eval import ROWS, gold  # noqa: E402

from evals.robust_eval_base import H_ASK, H_DRAFT, H_EDIT, op  # noqa: E402
from evals.robust_more import EDITS_MORE, ROUTE_ASK, ROUTE_DO  # noqa: E402

# (câu, câu trước, ý định chấp nhận, hành động xem bảng)
ROUTE = [
    # không dấu / viết tắt / sai chính tả
    ('du an nao cham tien do', [], ('filter', 'analyze'), None),
    ('may du an tre han', [], ('analyze', 'filter'), None),
    ('rr cao co may dA', [], ('filter', 'analyze'), None),
    ('tuan nay on ko', [], ('summary',), None),
    ('tom tat dum t tuan nay', [], ('summary',), None),
    ('nhom nao nhieu du an cham nhat', [], ('analyze',), None),
    ('ghi chu cho i.a.1.1 la cho hop', [], ('edit',), None),
    ('i.a.1.2 rui ro thap nha', [], ('edit',), None),
    ('dat td cham cho i.c.1.1 giup m', [], ('edit',), None),
    ('chuyen may cai food sang dung tien do', [], ('edit',), None),
    ('an cot note di', [], ('view',), 'hide'),
    ('hien lai cot note', [], ('view',), 'show'),
    ('chi cho t xem may dong loi', [], ('view',), 'only_fix'),
    ('bo loc het di', [], ('view',), 'show_all'),
    ('AI soan dum t may o trong', [], ('draft',), None),
    ('duyet het nhap cho t', [], ('approve',), None),
    # nói tự nhiên, nhiều cách
    ('xem giúp mình bao nhiêu dự án đang trễ', [], ('filter', 'analyze'), None),
    ('có cái nào sắp tới hạn không', [], ('analyze', 'filter'), None),
    ('top 3 dự án gần hạn nhất', [], ('analyze',), None),
    ('đừng hiện cột PIC nữa', [], ('view',), 'hide'),
    ('giấu cột ghi chú giùm', [], ('view',), 'hide'),
    ('cho tôi nhìn lại toàn bộ bảng', [], ('view',), 'show_all'),
    ('nhờ AI viết hộ phần rủi ro đang bỏ trống', [], ('draft',), None),
    ('OK mấy ô AI soạn chấp nhận hết', [], ('approve',), None),
    ('I.C.1.2 note là đang đợi PO', [], ('edit',), None),
    ('hạ rủi ro I.A.1.1 xuống thấp', [], ('edit',), None),
    ('mấy dự án Voice cho tiến độ có nguy cơ chậm', [], ('edit',), None),
    # chứa chữ "đổi/sửa" nhưng là HỎI
    ('ai đã sửa dự án I.A.1.1 lần cuối', [], ('project', 'search', 'summary', 'unknown'), None),
    ('đổi tiến độ có ảnh hưởng gì tới báo cáo không', [], ('unknown', 'summary', 'search'), None),
    # nối tiếp / nhớ hội thoại
    ('còn rủi ro cao thì sao', H_ASK, ('filter', 'analyze'), None),
    ('trong số đó cái nào rủi ro cao', H_ASK, ('analyze', 'filter'), None),
    ('mấy dự án này ai phụ trách', H_ASK, ('analyze', 'project', 'projects', 'summary', 'filter', 'search'), None),
    ('cũng ghi vậy cho I.A.1.2', H_EDIT, ('edit',), None),
    ('đổi lại thành Cao', [{'q': 'cho I.A.1.1 rủi ro thấp', 'codes': ['I.A.1.1'], 'a': 'Mình đã soạn 1 thay đổi'}], ('edit',), None),
    ('thêm I.C.1.1 nữa', [{'q': 'cho I.A.1.1 rủi ro thấp', 'codes': ['I.A.1.1'], 'a': 'Mình đã soạn 1 thay đổi'}], ('edit',), None),
    ('làm tiếp đi', H_DRAFT, ('draft', 'unknown'), None),
    # xin gợi ý ưu tiên / tạm hoãn khi bị cắt giảm
    ('bây giờ tôi bị rút bớt kinh phí, nên không thể chạy được hết tất cả dự án hiện tại, tôi nên pending dự án nào và ưu tiên cái nào', [], ('prioritize',), None),
    ('thiếu người nên tạm dừng dự án nào', [], ('prioritize',), None),
    ('cắt ngân sách thì giữ dự án nào', [], ('prioritize',), None),
    ('nen uu tien du an nao truoc', [], ('prioritize',), None),
    ('dự án nào nên dừng trước nếu phải cắt giảm', [], ('prioritize',), None),
    # hỏi một dự án và xin báo cáo chi tiết, hỏi về khả năng của trợ lý
    ('Báo cáo chi tiết dự án I.A.1.1', [], ('project', 'search'), None),
    ('Bạn có tạo được biểu đồ hay ma trận tóm tắt không?', [], ('help',), None),
    # xác nhận / lạc đề
    ('ok', H_DRAFT, ('unknown',), None),
    ('cảm ơn nha', H_ASK, ('unknown',), None),
    ('hôm nay thời tiết thế nào', [], ('unknown',), None),
]

# Phần 2: lệnh sửa nối tiếp -> (câu, câu trước, kế hoạch V-LLM giả cho chế độ offline, ô mong đợi {(mã, cột): giá trị})
FIELDS = [
    {'id': 'td', 'name': 'Tiến độ', 'options': ['Đúng tiến độ', 'Có nguy cơ chậm', 'Chậm tiến độ']},
    {'id': 'rui', 'name': 'Mức độ rủi ro', 'options': ['Cao', 'Trung bình', 'Thấp']},
    {'id': 'mang', 'name': 'Nhóm', 'options': ['Food', 'Voice', 'Ride']},
    {'id': 'ghichu', 'name': 'Ghi chú'},
]
EROWS = [{'code': r['code'], 'values': {'td': r['progress'], 'rui': r['risk'], 'mang': r['group'], 'ghichu': ''}} for r in ROWS]


EDITS = [
    ('cũng ghi vậy cho I.A.1.2', H_EDIT, [op('ghichu', 'chờ họp', codes=['I.A.1.2'])], {('I.A.1.2', 'ghichu'): 'chờ họp'}),
    ('đặt rủi ro thấp cho mấy dự án đó luôn', H_EDIT, [op('rui', 'Thấp', codes=['I.A.1.1', 'I.A.2.1', 'II.A.1.1'])], {('I.A.1.1', 'rui'): 'Thấp', ('I.A.2.1', 'rui'): 'Thấp', ('II.A.1.1', 'rui'): 'Thấp'}),
    ('đổi lại thành Trung bình', [{'q': 'cho I.A.1.2 rủi ro cao', 'codes': ['I.A.1.2'], 'a': 'Mình đã soạn 1 thay đổi'}], [op('rui', 'Trung bình', codes=['I.A.1.2'])], {('I.A.1.2', 'rui'): 'Trung bình'}),
    ('thêm I.C.1.1 nữa', [{'q': 'cho I.A.1.2 rủi ro cao', 'codes': ['I.A.1.2'], 'a': 'Mình đã soạn 1 thay đổi'}], [op('rui', 'Cao', codes=['I.C.1.1'])], {('I.C.1.1', 'rui'): 'Cao'}),
    ('ghi chu cho i.a.1.2 la cho gpu', [], [op('ghichu', 'chờ GPU', codes=['I.A.1.2'])], {('I.A.1.2', 'ghichu'): 'chờ GPU'}),
    ('i.a.1.2 tien do cham', [], [op('td', 'Chậm tiến độ', codes=['I.A.1.2'])], {('I.A.1.2', 'td'): 'Chậm tiến độ'}),
    ('rui ro cao cho may cai ride nha', [], [op('rui', 'Cao', wf='mang', wv='Ride')], {('I.C.1.2', 'rui'): 'Cao'}),  # II.A.1.1 đã Cao
    # không nhắc dự án nào và không có từ chỉ câu trước -> không được tự lấy mã cũ
    ('ghi chú chờ họp', H_EDIT, [op('ghichu', 'chờ họp', codes=['I.A.1.1'])], {}),
]
ROUTE += ROUTE_ASK + ROUTE_DO
EDITS += EDITS_MORE


def run_route(q, hist, accept, view, mode):
    if mode == 'mock':
        settings.mode = 'vllm'
        agent.client.chat_json = lambda *a, **k: {'model': 'gold', 'ms': 1, 'usage': {}, 'data': gold(accept, view)}
    try:
        spec, by = agent.route(q, agent._clean_rows(ROWS), {}, agent._clean_history(hist, agent._clean_rows(ROWS)))
    except Exception as e:  # noqa: BLE001
        return None, f'lỗi: {e}'
    return spec, by


def run_edit(q, hist, plan, want, mode):
    settings.mode = 'vllm'
    if mode == 'mock':
        agent_edit.client.chat_json = lambda *a, **k: {'model': 'gold', 'ms': 1, 'usage': {}, 'data': {'ops': plan, 'unclear': ''}}
    out = agent_edit.propose(q, EROWS, FIELDS, history=agent._clean_history(hist, agent._clean_rows(ROWS)))
    got = {(p['code'], p['field']): p['to'] for p in out['proposals']}
    return got == want, got, out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['mock', 'live'], default='mock')
    ap.add_argument('--verbose', action='store_true')
    args = ap.parse_args()
    if args.mode == 'live' and (settings.mode != 'vllm' or settings.problems()):
        print('Chế độ live cần AI_MODE=vllm và cấu hình V-LLM hợp lệ:', settings.problems() or 'đang là mock')
        return 2
    ok = 0
    print('== Phần 1: đọc ý định ==')
    for q, hist, accept, view in ROUTE:
        spec, by = run_route(q, hist, accept, view, args.mode)
        good = bool(spec) and spec['query'] in accept and (view is None or spec.get('action') == view) and by != 'rule'
        ok += good
        if args.verbose or not good:
            print(('PASS' if good else 'FAIL'), q)
            if not good:
                print('   mong đợi:', accept, view or '', '| nhận được:', spec, '| bởi:', by)
    n1 = ok
    print(f'-> {n1}/{len(ROUTE)}\n== Phần 2: sửa nối tiếp / không dấu ==')
    for q, hist, plan, want in EDITS:
        good, got, out = run_edit(q, hist, plan, want, args.mode)
        ok += good
        if args.verbose or not good:
            print(('PASS' if good else 'FAIL'), q)
            if not good:
                print('   mong đợi:', want, '| nhận được:', got, '| kế hoạch AI:', out.get('plan'))
    print(f'-> {ok - n1}/{len(EDITS)}\n\n{ok}/{len(ROUTE) + len(EDITS)} ca đạt ({args.mode})')
    return 0 if ok == len(ROUTE) + len(EDITS) else 1


if __name__ == '__main__':
    raise SystemExit(main())

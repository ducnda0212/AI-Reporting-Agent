"""Đánh giá bước V-LLM đọc Ý ĐỊNH của câu chat (hỏi gì? hay muốn sửa / soạn nháp / duyệt / đổi cách xem bảng?).

Chạy (ở thư mục server, đã mở venv):
    python -m evals.intent_eval                 # offline: V-LLM giả trả đúng ý định -> kiểm tầng code (chuẩn hoá, mã do code đọc, bỏ giá trị bậy)
    python -m evals.intent_eval --mode live     # gọi V-LLM thật -> đo khả năng hiểu câu tự nhiên (cần server/.env có AI_MODE=vllm)
    python -m evals.intent_eval --mode live --verbose

Mỗi ca: câu người dùng, ý định đúng (`query`), và (nếu có) hành động xem bảng. Cố ý có câu chứa chữ "đổi"/"sửa" nhưng là câu HỎI, và câu sửa không có động từ lệnh.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from server.app.ai.agent import qa as agent  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402

T = [  # (mã, tiến độ, rủi ro, nhóm, trạng thái)
    ('I.A.1.1', 'Chậm tiến độ', 'Cao', 'Food', 'In Progress'), ('I.A.1.2', 'Đúng tiến độ', '', 'Food', 'In Progress'),
    ('I.A.2.1', 'Chậm tiến độ', 'Trung bình', 'Voice', 'Done'), ('I.C.1.1', 'Có nguy cơ chậm', '', 'Voice', 'In Progress'),
    ('I.C.1.2', 'Đúng tiến độ', 'Thấp', 'Ride', 'In Progress'), ('II.A.1.1', 'Chậm tiến độ', 'Cao', 'Ride', 'In Progress'),
]
ROWS = [{'code': c, 'name': 'Dự án ' + c, 'group': m, 'status': tt, 'progress': td, 'risk': r, 'pic': '', 'end': '', 'pending': False} for c, td, r, m, tt in T]

ASK = ('summary', 'filter', 'analyze', 'project', 'search', 'pending')
# (câu, các ý định chấp nhận, hành động xem bảng nếu có)
CASES = [
    # sửa bảng: viết tự nhiên, có khi không có động từ lệnh
    ('I.A.1.1 chờ họp nhé', ('edit',), None),
    ('mấy dự án trễ thì ghi note chờ CBLD giúp mình', ('edit',), None),
    ('cho I.A.1.2 mức rủi ro thấp đi', ('edit',), None),
    ('chuyển hết dự án Food sang đúng tiến độ', ('edit',), None),
    ('ghi giúp mình là đang chờ PO ở I.C.1.2', ('edit',), None),
    ('dự án nào chưa có note thì điền đang xử lý', ('edit',), None),
    ('đánh dấu I.A.2.1 là rủi ro cao', ('edit',), None),
    # hỏi đáp (kể cả câu có chữ giống lệnh)
    ('dự án nào đang chậm?', ('filter', 'analyze'), None),
    ('có bao nhiêu dự án rủi ro cao', ('filter', 'analyze'), None),
    ('tuần này tình hình sao', ('summary',), None),
    ('I.A.1.1 thế nào rồi', ('project',), None),
    ('nhóm Voice mà đang trễ có mấy cái', ('analyze', 'filter'), None),
    ('mỗi nhóm có bao nhiêu dự án chậm', ('analyze',), None),
    ('còn nháp nào chờ duyệt không', ('pending',), None),
    ('đổi lại thì dự án nào đang chậm?', ASK, None),
    ('sửa xong chưa, còn bao nhiêu dự án rủi ro cao', ASK, None),
    ('ghi chú của I.C.1.2 là gì', ('search', 'project'), None),
    # soạn nháp / duyệt
    ('soạn giúp mình mấy ô còn trống', ('draft',), None),
    ('nhờ AI viết nháp các ô chưa có nội dung đi', ('draft',), None),
    ('ok các nháp AI đi', ('approve',), None),
    ('duyệt nháp của I.A.1.1', ('approve',), None),
    # đổi cách xem bảng
    ('ẩn cột ghi chú đi cho gọn', ('view',), 'hide'),
    ('không muốn thấy cột rủi ro nữa', ('view',), 'hide'),
    ('cho xem lại cột ghi chú', ('view',), 'show'),
    ('chỉ cho mình xem mấy dòng còn phải sửa', ('view',), 'only_fix'),
    ('bỏ lọc đi, xem hết lại', ('view',), 'show_all'),
    # ngoài phạm vi
    ('hôm nay trời đẹp không', ('unknown',), None),
]


def gold(accept, view):
    q = accept[0]
    d = {'query': q, 'field': '', 'value': '', 'filters': [], 'group_by': '', 'sort': '', 'limit': 0, 'due': '', 'view_action': view or '', 'column': 'Note' if view in ('hide', 'show') else '', 'refers_previous': False}
    if q == 'filter':
        d.update(field='tien_do', value='chậm')
    if q == 'analyze':
        d.update(filters=[{'field': 'tien_do', 'value': 'chậm'}])
    return d


def run_case(q, accept, view, mode):
    if mode == 'mock':
        settings.mode = 'vllm'
        agent.client.chat_json = lambda *a, **k: {'model': 'gold', 'ms': 1, 'usage': {}, 'data': gold(accept, view)}
    t0 = time.time()
    rows = agent._clean_rows(ROWS)
    try:
        spec, by = agent.route(q, rows, {}, [])
    except Exception as e:  # noqa: BLE001
        return None, f'lỗi: {e}', time.time() - t0
    return spec, by, time.time() - t0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['mock', 'live'], default='mock')
    ap.add_argument('--verbose', action='store_true')
    args = ap.parse_args()
    if args.mode == 'live' and (settings.mode != 'vllm' or settings.problems()):
        print('Chế độ live cần AI_MODE=vllm và cấu hình V-LLM hợp lệ:', settings.problems() or 'đang là mock')
        return 2
    ok = 0
    for q, accept, view in CASES:
        spec, by, dt = run_case(q, accept, view, args.mode)
        good = bool(spec) and spec['query'] in accept and (view is None or spec.get('action') == view) and by != 'rule'
        ok += good
        if args.verbose or not good:
            print(('PASS' if good else 'FAIL'), f'{dt:5.1f}s', q)
            if not good:
                print('   mong đợi:', accept, view or '', '| nhận được:', spec, '| bởi:', by)
    print(f'\n{ok}/{len(CASES)} ca đạt ({args.mode})')
    return 0 if ok == len(CASES) else 1


if __name__ == '__main__':
    raise SystemExit(main())

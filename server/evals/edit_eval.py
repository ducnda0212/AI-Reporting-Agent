"""Đánh giá Agent sửa bảng với câu lệnh viết tự nhiên (V-LLM đọc ý, code kiểm tra, ra bản xem trước).

Chạy (ở thư mục server, đã mở venv):
    python -m evals.edit_eval                 # offline: V-LLM giả trả ĐÚNG thao tác của từng ca -> kiểm tầng code (phạm vi, giá trị, cột khóa, mã sai)
    python -m evals.edit_eval --mode live     # gọi V-LLM thật -> đo khả năng hiểu câu tự nhiên (cần server/.env có AI_MODE=vllm)
    python -m evals.edit_eval --mode live --verbose

Mỗi ca có `q` (câu người dùng), `ops` (cách đọc đúng, chỉ dùng cho chế độ offline) và `expect`: tập (mã, cột, giá trị mới) mà bản xem trước phải có.
`expect` rỗng = Agent không được đề xuất gì (cột khóa, mã không có, giá trị ngoài danh mục, câu mơ hồ).
Bảng thử là bảng giả 8 dự án, không phải dữ liệu thật.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from server.app.ai.agent import edit as agent_edit, qa as agent  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402

FIELDS = [
    {'id': 'td', 'name': 'Tiến độ', 'options': ['Đúng tiến độ', 'Có nguy cơ chậm', 'Chậm tiến độ']},
    {'id': 'rui', 'name': 'Mức độ rủi ro', 'options': ['Cao', 'Trung bình', 'Thấp']},
    {'id': 'mang', 'name': 'Nhóm', 'options': ['Food', 'Voice', 'Ride']},
    {'id': 'ghichu', 'name': 'Ghi chú'},
    {'id': 'tt', 'name': 'Trạng thái Jira', 'editable': False, 'lockedWhy': 'lấy thẳng từ Jira'},
]
T = [  # (mã, tiến độ, rủi ro, nhóm, ghi chú, trạng thái)
    ('I.A.1.1', 'Chậm tiến độ', 'Cao', 'Food', '', 'In Progress'), ('I.A.1.2', 'Đúng tiến độ', '', 'Food', 'ok', 'In Progress'),
    ('I.A.2.1', 'Chậm tiến độ', 'Trung bình', 'Voice', '', 'Done'), ('I.C.1.1', 'Có nguy cơ chậm', '', 'Voice', '', 'In Progress'),
    ('I.C.1.2', 'Đúng tiến độ', 'Thấp', 'Ride', 'chờ PO', 'In Progress'), ('II.A.1.1', 'Chậm tiến độ', 'Cao', 'Ride', '', 'In Progress'),
    ('II.A.1.2', 'Đúng tiến độ', '', 'Food', '', 'To Do'), ('II.B.1.1', 'Có nguy cơ chậm', 'Cao', 'Voice', 'đang xử lý', 'In Progress'),
]
ROWS = [{'code': c, 'name': c, 'values': {'td': td, 'rui': r, 'mang': m, 'ghichu': g, 'tt': tt}} for c, td, r, m, g, tt in T]
LATE = [c for c, td, *_ in T if td == 'Chậm tiến độ']
EMPTY_NOTE = [c for c, _td, _r, _m, g, _tt in T if not g]
FOOD = [c for c, _td, _r, m, _g, _tt in T if m == 'Food']
HIGH = [c for c, _td, r, *_ in T if r == 'Cao']
RIDE = [c for c, _td, _r, m, _g, _tt in T if m == 'Ride']
ALL = [c for c, *_ in T]


def op(field, value, codes=(), wf='', wv='', only_empty=False, all_=False):
    return {'field': field, 'value': value, 'target': {'codes': list(codes), 'where_field': wf, 'where_value': wv, 'only_empty': only_empty, 'all': all_}}


def E(codes, field, to, skip_same=True):
    cur = {c: {'td': td, 'rui': r, 'mang': m, 'ghichu': g}[field] for c, td, r, m, g, _tt in T}
    return {(c, field, to) for c in codes if not (skip_same and cur[c] == to)}


CASES = [
    ('mấy dự án đang trễ thì ghi note chờ họp giúp mình', [op('ghichu', 'chờ họp', wf='td', wv='Chậm tiến độ')], E(LATE, 'ghichu', 'chờ họp')),
    ('cho I.A.1.1 với I.A.1.2 mức rủi ro cao nhé', [op('rui', 'Cao', codes=['I.A.1.1', 'I.A.1.2'])], E(['I.A.1.1', 'I.A.1.2'], 'rui', 'Cao')),
    ('dự án nào chưa có note thì ghi chờ CBLD', [op('ghichu', 'chờ CBLD', only_empty=True)], E(EMPTY_NOTE, 'ghichu', 'chờ CBLD')),
    ('những dự án nhóm Food cho rủi ro thấp giúp mình', [op('rui', 'Thấp', wf='mang', wv='Food')], E(FOOD, 'rui', 'Thấp')),
    ('đổi tất cả dự án sang đúng tiến độ', [op('td', 'Đúng tiến độ', all_=True)], E([c for c, *_ in T], 'td', 'Đúng tiến độ')),
    ('I.A.1.1 note chờ họp', [op('ghichu', 'chờ họp', codes=['I.A.1.1'])], E(['I.A.1.1'], 'ghichu', 'chờ họp')),
    ('dự án rủi ro cao thì note là cần escalate', [op('ghichu', 'cần escalate', wf='rui', wv='Cao')], E(HIGH, 'ghichu', 'cần escalate')),
    ('I.A.1.2 và I.C.1.1 chuyển sang trung bình', [op('rui', 'Trung bình', codes=['I.A.1.2', 'I.C.1.1'])], E(['I.A.1.2', 'I.C.1.1'], 'rui', 'Trung bình')),
    ('với mấy dự án trễ hạn, đặt rủi ro cao', [op('rui', 'Cao', wf='td', wv='Chậm tiến độ')], E(LATE, 'rui', 'Cao')),
    ('set tiến độ của I.C.1.2 là chậm giúp mình', [op('td', 'Chậm tiến độ', codes=['I.C.1.2'])], E(['I.C.1.2'], 'td', 'Chậm tiến độ')),
    ('những dự án chưa có note nhóm Voice thì điền đang xử lý', [op('ghichu', 'đang xử lý', wf='mang', wv='Voice', only_empty=True)],
     E([c for c, _td, _r, m, g, _tt in T if m == 'Voice' and not g], 'ghichu', 'đang xử lý')),
    # câu có đuôi lịch sự / viết lẫn lộn (các lỗi từng gặp trên giao diện)
    ('đổi tiến độ của I.A.1.1 thành đúng tiến độ dc ko', [op('td', 'Đúng tiến độ', codes=['I.A.1.1'])], E(['I.A.1.1'], 'td', 'Đúng tiến độ')),
    ('điền Ghi chú "Chờ họp khối" cho tất cả các dự án', [op('ghichu', 'Chờ họp khối', all_=True)], E(ALL, 'ghichu', 'Chờ họp khối')),
    ('I.A.1.2 và I.C.1.2 ghi note đã họp xong nhé', [op('ghichu', 'đã họp xong', codes=['I.A.1.2', 'I.C.1.2'])], E(['I.A.1.2', 'I.C.1.2'], 'ghichu', 'đã họp xong')),
    ('chuyển mấy dự án nhóm Ride sang chậm tiến độ giúp mình với', [op('td', 'Chậm tiến độ', wf='mang', wv='Ride')], E(RIDE, 'td', 'Chậm tiến độ')),
    ('đặt mức rủi ro cao cho dự án II.A.1.2 được không', [op('rui', 'Cao', codes=['II.A.1.2'])], E(['II.A.1.2'], 'rui', 'Cao')),
    ('đổi tiến độ của I.A.1.1 thành chậm tiến độ', [op('td', 'Chậm tiến độ', codes=['I.A.1.1'])], set()),  # đã đúng sẵn: không đề xuất
    # phải từ chối / không đề xuất
    ('điền Ghi chú "Chờ họp khối" cho các dự án', [], set()),
    ('chuyển I.A.1.1 sang Done giúp mình', [op('tt', 'Done', codes=['I.A.1.1'])], set()),
    ('ghi note chờ họp cho ZZ.9.9.9', [op('ghichu', 'chờ họp', codes=['ZZ.9.9.9'])], set()),
    ('cho I.A.1.1 mức rủi ro siêu cao', [op('rui', 'siêu cao', codes=['I.A.1.1'])], set()),
    ('sửa giúp mình mấy dự án đi', [], set()),
    ('đổi mức rủi ro thành cao', [], set()),
]


def run_case(q, ops, mode):
    if mode == 'mock':
        settings.mode = 'vllm'
        agent_edit.client.chat_json = lambda *a, **k: {'model': 'gold', 'ms': 1, 'usage': {}, 'data': {'ops': ops, 'unclear': '' if ops else 'chưa rõ'}}
    t0 = time.time()
    try:
        out = agent.ask(q, ROWS, FIELDS, None, True)
    except Exception as e:  # noqa: BLE001
        return None, f'lỗi: {e}', time.time() - t0
    got = {(p['code'], p['field'], p['to']) for p in out.get('proposals', [])}
    why = ' | '.join(s['reason'] for s in out.get('skipped', [])) or out.get('unclear', '')
    return got, why + ('  [V-LLM đọc: ' + json.dumps(out.get('plan'), ensure_ascii=False)[:400] + ']' if out.get('plan') else ''), time.time() - t0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['mock', 'live'], default='mock')
    ap.add_argument('--verbose', action='store_true')
    args = ap.parse_args()
    if args.mode == 'live' and (settings.mode != 'vllm' or settings.problems()):
        print('Chế độ live cần AI_MODE=vllm và cấu hình V-LLM hợp lệ:', settings.problems() or 'đang là mock')
        return 2
    ok = 0
    for q, ops, expect in CASES:
        got, why, dt = run_case(q, ops, args.mode)
        good = got == expect
        ok += good
        if args.verbose or not good:
            print(('PASS' if good else 'FAIL'), f'{dt:5.1f}s', q)
            if not good:
                print('   mong đợi:', sorted(expect))
                print('   nhận được:', sorted(got) if got is not None else None, '|', why)
    print(f'\n{ok}/{len(CASES)} ca đạt ({args.mode})')
    return 0 if ok == len(CASES) else 1


if __name__ == '__main__':
    raise SystemExit(main())

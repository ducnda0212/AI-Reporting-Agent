"""Chạy nhanh vài câu trong bộ robust_eval (phần đọc ý định), không phải chạy cả 191 ca.

    python -m evals.quick                      # 3 câu từng fail gần đây
    python -m evals.quick "td i.c.1.1" "late"  # mọi câu trong bộ có chứa các đoạn chữ này (không phân biệt hoa thường)
Cần AI_MODE=vllm và cấu hình AI hợp lệ (đọc từ server/.env như server).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evals.robust_eval import ROUTE, run_route  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402

DEFAULT = ['I.C.1.1 vẫn có nguy cơ chậm nha', 'td i.c.1.1 la cham', 'lọc dòng còn lỗi thôi']


def main(keys: list[str], mode: str = 'live') -> int:
    if mode == 'live' and (settings.mode != 'vllm' or settings.problems()):
        print('Cần AI_MODE=vllm và cấu hình hợp lệ:', settings.problems() or 'đang là mock')
        return 2
    keys = [k.lower() for k in (keys or DEFAULT)]
    picked = [c for c in ROUTE if any(k in c[0].lower() for k in keys)]
    if not picked:
        print('Không có câu nào trong bộ khớp:', keys)
        return 2
    bad = 0
    for q, hist, accept, view in picked:
        spec, by = run_route(q, hist, accept, view, mode)
        good = bool(spec) and spec['query'] in accept and (view is None or spec.get('action') == view) and by != 'rule'
        bad += not good
        print(('PASS' if good else 'FAIL'), q, '' if good else f'\n   mong đợi: {accept} {view or ""} | nhận được: {spec} | bởi: {by}')
    print(f'-> {len(picked) - bad}/{len(picked)}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

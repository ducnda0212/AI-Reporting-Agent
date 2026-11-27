"""Chạy bộ câu của robust_eval (phần đọc ý định) qua chế độ CÔNG CỤ: V-LLM tự chọn công cụ thay vì chọn một loại truy vấn có sẵn.
Để so sánh với chế độ router: cùng bộ câu, cùng tiêu chí đạt.

    python -m evals.tools_eval                 # cả bộ
    python -m evals.tools_eval "chậm" "sập"    # chỉ các câu có chứa đoạn chữ này
Cần AI_MODE=vllm và cấu hình AI hợp lệ."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import evals.robust_eval as rb  # noqa: E402
from server.app.ai.agent import qa, tools  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402


def _route(question, rows, timing=None, history=None):
    spec, by, _ = tools.run(question, rows, timing if timing is not None else {}, history or [])
    return spec, by


def main(keys: list[str]) -> int:
    if settings.mode != 'vllm' or settings.problems():
        print('Cần AI_MODE=vllm và cấu hình hợp lệ:', settings.problems() or 'đang là mock')
        return 2
    qa.route = _route
    if hasattr(rb, 'route'):
        rb.route = _route
    keys = [k.lower() for k in keys]
    cases = [c for c in rb.ROUTE if not keys or any(k in c[0].lower() for k in keys)]
    bad = 0
    for q, hist, accept, view in cases:
        spec, by = rb.run_route(q, hist, accept, view, 'live')
        good = bool(spec) and spec['query'] in accept and (view is None or spec.get('action') == view) and by != 'rule'
        bad += not good
        if not good:
            print('FAIL', q, f'\n   mong đợi: {accept} {view or ""} | nhận được: {spec} | bởi: {by}')
    print(f'-> {len(cases) - bad}/{len(cases)} ca đạt (chế độ công cụ)')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

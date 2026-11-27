"""Chạy bộ câu của robust_eval (phần đọc ý định) qua chế độ CÔNG CỤ: V-LLM tự chọn công cụ thay vì chọn một loại truy vấn có sẵn.
Để so sánh với chế độ router: cùng bộ câu, cùng tiêu chí đạt.

    python -m evals.tools_eval                 # cả bộ
    python -m evals.tools_eval "chậm" "sập"    # chỉ các câu có chứa đoạn chữ này
Bộ ca = robust_eval.ROUTE + evals/tools_cases.py (công cụ mới, câu phải hỏi lại, câu từng sai).
Cần AI_MODE=vllm và cấu hình AI hợp lệ."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import evals.robust_eval as rb  # noqa: E402
from server.app.ai.agent import qa, tools  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402


LAST: dict = {}


def _route(question, rows, timing=None, history=None):
    t = timing if timing is not None else {}
    spec, by, _ = tools.run(question, rows, t, history or [])
    LAST.clear()
    LAST.update(t)
    return spec, by


def main(keys: list[str]) -> int:
    if settings.mode != 'vllm' or settings.problems():
        print('Cần AI_MODE=vllm và cấu hình hợp lệ:', settings.problems() or 'đang là mock')
        return 2
    print(f'{len(tools.TOOLS)} công cụ: {[t["name"] for t in tools.TOOLS]} | tool_choice={tools._choice["v"]}')
    qa.route = _route
    if hasattr(rb, 'route'):
        rb.route = _route
    keys = [k.lower() for k in keys]
    from evals.tools_cases import NEW_ROUTE  # noqa: E402
    cases = [c for c in [*rb.ROUTE, *NEW_ROUTE] if not keys or any(k in c[0].lower() for k in keys)]
    bad = 0
    for q, hist, accept, view in cases:
        spec, by = rb.run_route(q, hist, accept, view, 'live')
        kind = 'hoi_lai' if spec and spec.get('hoi_lai') else (spec or {}).get('query')   # hỏi lại cũng tính là 'unknown' khi ca chấp nhận 'unknown'
        good = bool(spec) and (kind in accept or (kind == 'hoi_lai' and 'unknown' in accept)) and (view is None or spec.get('action') == view) and by != 'rule'
        bad += not good
        if not good:
            steps = [(x.get('cong_cu'), x.get('tham_so'), x.get('loi') or x.get('ket_qua')) for x in LAST.get('cong_cu') or []]
            print('FAIL', q, f'\n   mong đợi: {accept} {view or ""} | nhận được: {spec} | bởi: {by}\n   công cụ V-LLM đã chọn: {steps or "không gọi công cụ nào"} {LAST.get("error", "")}')
    print(f'-> {len(cases) - bad}/{len(cases)} ca đạt (chế độ công cụ)')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

"""Đánh giá phần AI theo 6 tiêu chí chất lượng đã chọn, trên 26 ca V01–V26 của Bộ tiêu chí (dữ liệu giả định).

Chạy (ở thư mục server, đã mở venv):
    python -m evals.run_eval --mode mock            # không gọi AI, kiểm tra script
    python -m evals.run_eval --mode live            # gọi V-LLM thật, cần server/.env có AI_MODE=vllm
    python -m evals.run_eval --mode live --limit 5  # thử 5 ca đầu
    python -m evals.run_eval --mode live --only assess --repeat 3

6 tiêu chí (theo bảng tiêu chí chất lượng của công ty):
  1. Độ chính xác       — loại RID, loại vấn đề, priority khớp đáp án V01–V26
  2. Bám nguồn          — không bịa số liệu (số+đơn vị), cấp báo cáo, người, hạn ngoài dữ liệu đầu vào
  3. Tính đầy đủ        — có hành động + điều kiện đóng; gợi ý đề xuất đủ số rủi ro thiếu
  4. Tuân thủ chỉ dẫn   — đúng định dạng, ≤25 từ/đề xuất, không tên thật, không tự gán người phụ trách
  5. Nhận biết bối cảnh — dữ liệu thiếu thì nói rõ chưa chắc (confidence thấp hoặc missingInfo)
  6. Chỉ số riêng       — mức rủi ro/priority khớp PMO (tính cùng quy tắc, không cộng điểm thiếu người phụ trách)
Kèm hiệu năng: thời gian mỗi cuộc gọi (P50/P95) và tỷ lệ gọi thành công.

Lưu ý: nhóm C9 bị bỏ qua (theo quyết định của PMO); người phụ trách không bắt buộc nên bỏ phần "+1 thiếu hạn/PIC".
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))  # gốc repo, để import app...

from app.ai import drafts, risk  # noqa: E402
from app.ai.settings import settings  # noqa: E402

WEEK = {'key': 'w3', 'start': '2026-11-15', 'end': '2026-11-22'}
ROLES = re.compile(r'\((?:[^)]*\b)?(PM|PMO|Tech Lead|KD/AM|QA)\b[^)]*\)')
PROB = {'TB': 'Trung bình', 'Cao': 'Cao', 'Thấp': 'Thấp'}
TARGET_P95 = {'thường': 5.0, 'suy luận': 60.0}   # TTLT P95 (giây) theo bảng hiệu năng của công ty


def load_cases() -> list[dict]:
    return json.loads((HERE / 'cases.json').read_text(encoding='utf-8'))['cases']


def ungrounded(text: str, source: str) -> list[str]:
    """Số kèm đơn vị hoặc cấp báo cáo xuất hiện trong `text` mà không có trong dữ liệu đầu vào."""
    src = source.lower()
    nums = set(re.findall(r'(?<!\w)\d+', src))
    bad = [f'số {n} trong "{x.strip()[:70]}"' for x in re.split(r'[;,\n]', text) for n in drafts._NUM_UNIT.findall(x) if n not in nums]
    bad += [w for w in drafts._ESCALATE if w in text.lower() and w not in src]
    return bad


def pct(a: int, b: int) -> str:
    return f'{a}/{b} ({100 * a / b:.0f}%)' if b else 'n/a'


def percentile(xs: list[float], q: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


def timed(fn, *a):
    t = time.time()
    try:
        return fn(*a), time.time() - t, ''
    except Exception as e:  # noqa: BLE001 — ghi nhận lỗi, không dừng cả lượt đánh giá
        return None, time.time() - t, f'{type(e).__name__}: {e}'


def reference_priority(c: dict) -> tuple[str, str]:
    """Priority/màu đúng theo bộ tiêu chí, dựa trên đầu vào chuẩn của ca, không cộng "thiếu hạn/PIC"."""
    i = c['inputs']
    case = {'kind': c['expect']['kind'], 'category': c['expect']['category'], 'probability': PROB.get(i['probability'], ''),
            'impact': {k: i[k] for k in ('delayDays', 'financePct', 'contract', 'quality', 'dataControl')},
            'daysToDue': i['daysToDue'], 'blocked': i['blocked'], 'weeksOpen': i['weeksOpen'], 'noOwner': False,
            'signals': [[s, ''] for s in c['expect']['signals'] if s != 'R02']}
    sc = risk.score(case)
    return sc['priority'], sc['color']


def run_assess(cases: list[dict]) -> list[dict]:
    out = []
    for c in cases:
        ctx = {'code': c['id'], 'task': c['project'], 'daysToDue': c['inputs']['daysToDue'], 'weeksOpen': c['inputs']['weeksOpen']}
        res, sec, err = timed(risk.assess, c['text'], ctx)
        out.append({'id': c['id'], 'sec': sec, 'err': err, 'res': res, 'ctx': ctx})
        print(f"  assess {c['id']} {'LỖI ' + err if err else f'{sec:.1f}s'}", flush=True)
    return out


def run_draft(cases: list[dict]) -> tuple[list[dict], int]:
    """Mỗi ca thành một dòng có rủi ro trong Risk Notes nhưng chưa có Todo → AI phải gợi ý đề xuất."""
    stripped = [0]
    orig = drafts._strip_invented

    def counting(action: str, row: dict) -> str:
        new = orig(action, row)
        if new != action:
            stripped[0] += 1
        return new
    drafts._strip_invented = counting
    out = []
    try:
        for c in cases:
            text = ' '.join(c['text'].split()).replace('|', '/')
            rn = f"||Date||Mô tả issue/risk||Todo||PIC||\n|{{{{2026-11-17}}}}|{text}| | |\n"
            row = {'id': c['id'], 'code': c['id'], 'task': c['project'], 'week': WEEK, 'riskNotes': rn, 'late': c['inputs']['daysToDue'] < 0,
                   'weekReport': {'date': '2026-11-18', 'done': 'Đang xử lý các hạng mục theo kế hoạch.', 'plan': ''}}
            res, sec, err = timed(drafts.draft_row, row)
            out.append({'id': c['id'], 'sec': sec, 'err': err, 'res': res, 'src': text})
            print(f"  draft  {c['id']} {'LỖI ' + err if err else f'{sec:.1f}s'}", flush=True)
    finally:
        drafts._strip_invented = orig
    return out, stripped[0]


def evaluate(cases, assess, draft, stripped) -> dict:
    by = {c['id']: c for c in cases}
    m: dict = {}
    # --- 1 & 6: độ chính xác / chỉ số riêng (bỏ C9)
    scored = [a for a in assess if a['res'] and by[a['id']]['expect']['category'] != 'C9']
    kind_ok = [a for a in scored if a['res']['case']['kind'] == by[a['id']]['expect']['kind']]
    cat_ok = [a for a in scored if a['res']['case']['category'] == by[a['id']]['expect']['category']]
    cat_miss = [(a['id'], by[a['id']]['expect']['category'], a['res']['case']['category']) for a in scored if a not in cat_ok]
    m['1 Độ chính xác'] = {'Loại vấn đề đúng': pct(len(cat_ok), len(scored)), 'Loại RID đúng': pct(len(kind_ok), len(scored)),
                           'sai loại vấn đề (ca, đúng, AI)': cat_miss}
    pri = [a for a in scored if by[a['id']]['status'] != 'Đã đóng']
    pri_ok, pri_miss, pri_detail = [], [], []
    for a in pri:
        ref = reference_priority(by[a['id']])
        got = (a['res']['score']['priority'], a['res']['score']['color'])
        (pri_ok if got[0] == ref[0] else pri_miss).append((a['id'], ref[0], got[0]))
        if got[0] != ref[0]:
            ai, exp = a['res']['case'], by[a['id']]['inputs']
            keys = ('delayDays', 'financePct', 'contract', 'quality', 'dataControl')
            diff = {k: f"AI {ai['impact'][k]} / đúng {exp[k]}" for k in keys if ai['impact'][k] != exp[k]}
            if ai['blocked'] != exp['blocked']:
                diff['blocked'] = f"AI {ai['blocked']} / đúng {exp['blocked']}"
            pri_detail.append({'ca': a['id'], 'đúng→AI': f"{ref[0]}→{got[0]}", 'số liệu AI trích lệch': diff,
                               'urgency': a['res']['score']['urgency'], 'impact': a['res']['score']['impact']})
    m['6 Chỉ số riêng'] = {'Priority khớp PMO': pct(len(pri_ok), len(pri)), 'lệch (ca, đúng, AI)': pri_miss,
                           'chi tiết lệch': pri_detail,
                           'ghi chú': 'bỏ V23 (ca đã đóng) và nhóm C9; không cộng +1 thiếu hạn/PIC'}
    # --- 2: bám nguồn
    viol = []
    n_checked = 0
    for a in assess:
        if not a['res']:
            continue
        n_checked += 1
        src = by[a['id']]['text'] + ' ' + json.dumps(a['ctx'], ensure_ascii=False)
        txt = ' '.join([x.get('text', '') for x in a['res']['case']['actions']] + [a['res']['case']['closeWhen']])
        bad = ungrounded(txt, src)
        if bad:
            viol.append(('assess', a['id'], bad))
    for d in draft:
        if not d['res'] or not d['res']['issues']['suggestion']:
            continue
        n_checked += 1
        bad = ungrounded(d['res']['issues']['suggestion']['text'], d['src'] + ' 2026-11-15 2026-11-22 2026-11-17 2026-11-18')
        if bad:
            viol.append(('draft', d['id'], bad))
    m['2 Bám nguồn'] = {'Đầu ra không có chi tiết ngoài dữ liệu': pct(n_checked - len(viol), n_checked), 'vi phạm': viol,
                        'AI tự thêm ngưỡng/cấp (đã bị code bỏ, draft)': stripped}
    # --- 3: đầy đủ
    full_a = [a for a in assess if a['res'] and any((x.get('text') or '').strip() for x in a['res']['case']['actions']) and a['res']['case']['closeWhen'].strip()]
    ok_d = [d for d in draft if d['res'] and d['res']['issues']['suggestion'] and d['res']['issues']['suggestion']['count'] == 1]
    m['3 Tính đầy đủ'] = {'assess có hành động + điều kiện đóng': pct(len(full_a), sum(1 for a in assess if a['res'])),
                          'draft có đề xuất cho rủi ro thiếu': pct(len(ok_d), sum(1 for d in draft if d['res']))}
    # --- 4: tuân thủ chỉ dẫn
    fmt_bad = []
    n4 = 0
    for d in draft:
        sug = d['res'] and d['res']['issues']['suggestion']
        if not sug:
            continue
        n4 += 1
        lines = sug['text'].split('\n')
        action = lines[-1].replace('→ Đề xuất:', '').strip() if lines else ''
        probs = []
        if len(lines) < 2 or not lines[-1].startswith('→ Đề xuất: '):
            probs.append('sai định dạng')
        if len(action.split()) > 25:
            probs.append(f'{len(action.split())} từ > 25')
        if '[Người' in sug['text']:
            probs.append('còn nhãn [Người n]')
        if ROLES.search(sug['text']):
            probs.append('tự gán người phụ trách')
        if probs:
            fmt_bad.append((d['id'], probs))
    m['4 Tuân thủ chỉ dẫn'] = {'Đề xuất đúng định dạng, ≤25 từ, không tự gán người': pct(n4 - len(fmt_bad), n4), 'vi phạm': fmt_bad}
    # --- 5: nhận biết bối cảnh — ca thiếu hạn/PIC theo bộ tiêu chí phải được nói rõ "chưa chắc"
    ctx_cases = [a for a in assess if a['res'] and by[a['id']]['inputs']['noOwner']]
    aware = [a for a in ctx_cases if a['res']['case']['confidence'] == 'low' or a['res']['case']['missingInfo']]
    m['5 Nhận biết bối cảnh'] = {'Ca thiếu thông tin được nói rõ': pct(len(aware), len(ctx_cases)),
                                 'ghi chú': 'chỉ ' + str(len(ctx_cases)) + ' ca trong bộ mẫu thuộc loại này; cần thêm ca để kết luận chắc'}
    # --- hiệu năng
    perf = {}
    for name, rows in (('assess', assess), ('draft', [d for d in draft if d['res'] and d['res']['issues']['need'] != 'none'])):
        ok = [r['sec'] for r in rows if not r['err']]
        n_all = len(rows)
        perf[name] = {'cuộc gọi': n_all, 'thành công': pct(len(ok), n_all), 'P50 (s)': round(statistics.median(ok), 1) if ok else None,
                      'P95 (s)': round(percentile(ok, 0.95), 1) if ok else None,
                      'đạt mục tiêu P95 ≤5s (mô hình thường)': bool(ok) and percentile(ok, 0.95) <= TARGET_P95['thường'],
                      'đạt mục tiêu P95 ≤60s (mô hình suy luận)': bool(ok) and percentile(ok, 0.95) <= TARGET_P95['suy luận'],
                      'lỗi': [(r['id'], r['err']) for r in rows if r['err']][:5]}
    m['Hiệu năng'] = perf
    m['Hiệu năng']['ghi chú'] = 'đo thời gian trọn cuộc gọi (TTLT), không streaming nên chưa đo được TTFT'
    return m


def to_markdown(m: dict, meta: dict) -> str:
    lines = [f"# Báo cáo đánh giá AI — {meta['when']}", '',
             f"Chế độ: {meta['mode']} · model: {meta['model']} · {meta['n']} ca · lặp {meta['repeat']} lần", '']
    for k, v in m.items():
        lines.append(f'## {k}')
        for kk, vv in v.items():
            lines.append(f'- **{kk}:** {json.dumps(vv, ensure_ascii=False) if isinstance(vv, (dict, list)) else vv}')
        lines.append('')
    return '\n'.join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--mode', choices=['mock', 'live'], default='mock')
    ap.add_argument('--only', choices=['all', 'assess', 'draft'], default='all')
    ap.add_argument('--limit', type=int, default=0, help='chỉ chạy N ca đầu')
    ap.add_argument('--repeat', type=int, default=1, help='lặp để đo hiệu năng và độ ổn định')
    ap.add_argument('--model', default='', help='ghi đè model cho lượt chạy này (vd v-llm-v1-medium)')
    ap.add_argument('--timeout', type=float, default=0, help='giây chờ tối đa mỗi lần gọi (mặc định theo .env)')
    a = ap.parse_args()
    if a.model:
        settings.model = a.model
    if a.timeout:
        settings.timeout = a.timeout
    if a.mode == 'live':
        if settings.mode != 'vllm':
            sys.exit('server/.env cần AI_MODE=vllm để chạy --mode live')
    else:
        settings.mode = 'mock'
    cases = load_cases()
    if a.limit:
        cases = cases[:a.limit]
    assess, draft, stripped = [], [], 0
    for r in range(a.repeat):
        print(f'Lượt {r + 1}/{a.repeat}')
        if a.only in ('all', 'assess'):
            assess += run_assess(cases)
        if a.only in ('all', 'draft'):
            d, s = run_draft(cases)
            draft += d
            stripped += s
    m = evaluate(cases, assess, draft, stripped)
    model = next((x['res']['model'] for x in assess if x['res']), None) or next((x['res']['issues']['suggestion']['by'] for x in draft if x['res'] and x['res']['issues']['suggestion']), settings.model)
    meta = {'when': datetime.now().strftime('%Y-%m-%d %H:%M'), 'mode': a.mode, 'model': model, 'n': len(cases), 'repeat': a.repeat}
    md = to_markdown(m, meta)
    print('\n' + md)
    out = HERE / 'out'
    out.mkdir(exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M')
    (out / f'report-{a.mode}-{stamp}.md').write_text(md, encoding='utf-8')
    (out / f'report-{a.mode}-{stamp}.json').write_text(json.dumps({'meta': meta, 'metrics': m}, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
    print(f'\nĐã lưu: evals/out/report-{a.mode}-{stamp}.md (và .json)')


if __name__ == '__main__':
    main()

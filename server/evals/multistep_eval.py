"""Đo Agent trả lời các câu HỎI NHIỀU BƯỚC / nhiều điều kiện, để quyết định có cần vòng gọi công cụ (tool-calling) hay không.

Chạy (ở thư mục server, đã mở venv):
    python -m evals.multistep_eval                  # offline: chỉ luật, không gọi AI (thường điểm thấp, chỉ để kiểm file chạy được)
    python -m evals.multistep_eval --mode live      # V-LLM thật, cần server/.env có AI_MODE=vllm
    python -m evals.multistep_eval --mode live --verbose --only dep

Đáp án (gold) tính bằng mã riêng của file này từ dữ liệu, không dùng hàm của qa.py.
Nhóm:
  one  — một đặc tả là đủ: nhiều điều kiện cùng lúc, hạn, xếp thứ tự, đếm theo nhóm (Agent hiện tại nên làm được)
  dep  — bước sau phụ thuộc kết quả bước trước ("người nhiều dự án nhất → liệt kê dự án của họ"), hợp "A hoặc B", phủ định,
         giao với tìm theo nội dung, phần trăm, so sánh hai nhóm (một đặc tả khó diễn tả hết)
Cách chấm:
  set   — tập mã dự án Agent đưa ra (facts) phải ĐÚNG bằng đáp án
  count — số lượng Agent tính (so_luong) hoặc nêu trong câu trả lời phải bằng đáp án
  text  — câu trả lời phải chứa mọi cụm chữ yêu cầu (bỏ dấu, không phân biệt hoa thường)
  order — các mã đầu tiên phải đúng thứ tự
Kết luận mong đợi: nhóm one ≥ 85% thì giữ kiến trúc hiện tại; nhóm dep thấp (< 60%) mới đáng làm tool-calling.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
from collections import Counter
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from server.app.ai.agent import qa  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402
from server.evals.qa_eval import DEFAULT_FIXTURE, TODAY, build_rows, codes_in, fold, has_text, parse_date, shown  # noqa: E402

FIN = {'Hoàn thành'}
BAD = {'Chậm tiến độ', 'Có nguy cơ chậm'}  # "chậm hoặc nguy cơ"; 'Không theo dõi' không tính


def cases(rows: list[dict]) -> list[dict]:
    due = lambda r: parse_date(r['end'])
    horizon = lambda n: date.fromordinal(TODAY.toordinal() + n)
    S = lambda pred: {r['code'] for r in rows if pred(r)}
    late = S(lambda r: r['progress'] == 'Chậm tiến độ')
    risk = S(lambda r: r['progress'] == 'Có nguy cơ chậm')
    notdone = lambda r: r['status'] not in FIN
    by_pic = Counter(r['pic'] for r in rows if r['pic'])
    top_pic = by_pic.most_common(1)[0][0]
    late_pics = sorted({r['pic'] for r in rows if r['code'] in late and r['pic']})
    bad_by_group = Counter(r['group'] for r in rows if r['progress'] in BAD)
    top_group = bad_by_group.most_common(1)[0][0]
    done_by_group = Counter(r['group'] for r in rows if r['status'] in FIN)
    moc = next(g for g in done_by_group if 'MOC' in g)
    cung = next(g for g in done_by_group if 'Cung-Cầu' in g)
    winner = 'MOC' if done_by_group[moc] > done_by_group[cung] else 'Điều phối'
    n_ok = sum(1 for r in rows if r['progress'] == 'Đúng tiến độ')
    pct = round(100 * n_ok / len(rows))
    near_risk = sorted((r for r in rows if r['progress'] in BAD and notdone(r) and due(r)), key=lambda r: due(r))[:3]
    api_late = late & has_text(rows, 'API')
    short_pic = top_pic
    top_group_late = S(lambda r: r['group'] == top_group and r['progress'] in BAD)

    C = [
        # ---- one: một đặc tả là đủ ----
        ('one', 'dự án nào vừa chậm tiến độ vừa đang thực hiện', 'set', late & S(lambda r: r['status'] == 'Đang thực hiện')),
        ('one', 'liệt kê dự án có nguy cơ chậm và đang thực hiện', 'set', risk & S(lambda r: r['status'] == 'Đang thực hiện')),
        ('one', 'dự án có nguy cơ chậm mà hạn trong 30 ngày tới là những dự án nào', 'set', risk & S(lambda r: due(r) and TODAY <= due(r) <= horizon(30) and notdone(r))),
        ('one', 'dự án đã quá hạn mà chưa hoàn thành', 'set', S(lambda r: due(r) and due(r) < TODAY and notdone(r))),
        ('one', 'mỗi nhóm có bao nhiêu dự án hoàn thành', 'text', [str(done_by_group[moc]), str(done_by_group[cung])]),
        ('one', f'{short_pic} đang phụ trách bao nhiêu dự án', 'count', by_pic[short_pic]),
        ('dep', 'cho tôi 3 dự án chậm hoặc nguy cơ có hạn gần nhất', 'order', [r['code'] for r in near_risk]),
        ('one', 'có bao nhiêu dự án chưa bắt đầu', 'count', sum(1 for r in rows if r['status'] == 'Chưa bắt đầu')),
        # ---- dep: bước sau phụ thuộc bước trước / hợp / phủ định / giao nội dung / phần trăm / so sánh ----
        ('dep', 'ai phụ trách nhiều dự án nhất, liệt kê các dự án của người đó', 'set', S(lambda r: r['pic'] == top_pic)),
        ('dep', 'người nào đang giữ nhiều dự án nhất? cho xem dự án của họ', 'set', S(lambda r: r['pic'] == top_pic)),
        ('dep', 'dự án chậm hoặc có nguy cơ chậm là những dự án nào', 'set', late | risk),
        ('dep', 'cho tôi cả dự án chậm lẫn dự án nguy cơ chậm đang thực hiện', 'set', (late | risk) & S(lambda r: r['status'] == 'Đang thực hiện')),
        ('dep', 'dự án chưa hoàn thành mà tiến độ không đúng kế hoạch', 'set', S(lambda r: notdone(r) and r['progress'] != 'Đúng tiến độ')),
        ('dep', 'dự án nào không phải đúng tiến độ', 'set', S(lambda r: r['progress'] != 'Đúng tiến độ')),
        ('dep', 'trong các dự án chậm tiến độ, ai phụ trách', 'text', late_pics),
        ('dep', 'dự án chậm nào có nhắc tới API', 'set', api_late),
        ('dep', 'nhóm nào có nhiều dự án chậm hoặc nguy cơ nhất, liệt kê dự án chậm hoặc nguy cơ của nhóm đó', 'set', top_group_late),
        ('dep', 'bao nhiêu phần trăm dự án đang đúng tiến độ', 'text', [str(pct)]),
        ('dep', 'bao nhiêu dự án chưa hoàn thành', 'count', sum(1 for r in rows if notdone(r))),
        ('dep', 'nhóm MOC hay nhóm Điều phối Cung-Cầu có nhiều dự án hoàn thành hơn', 'text', [winner]),
        ('dep', 'trừ các dự án hoàn thành, còn bao nhiêu dự án đang chậm hoặc nguy cơ', 'count', sum(1 for r in rows if notdone(r) and r['progress'] in BAD)),
        ('dep', 'so sánh số dự án chậm và số dự án nguy cơ chậm, loại nào nhiều hơn', 'text', [str(len(risk)), str(len(late)), 'nguy co' if len(risk) > len(late) else 'cham tien do']),
    ]
    return [{'group': g, 'q': q, 'check': c, 'gold': v} for g, q, c, v in C]


def judge(c: dict, out: dict, rows: list[dict]) -> tuple[bool, str]:
    f = out.get('facts') or {}
    sh = shown(out)
    ans = fold(out.get('answer', '') + ' ' + out.get('lead', ''))
    gold = c['gold']
    note = f"intent={out['intent']} shown={sh[:5]}{'…' if len(sh) > 5 else ''} so_luong={f.get('so_luong')}"
    if c['check'] == 'set':
        got = set(sh) if len(sh) < qa.MAX_LIST else set(sh)
        ok = got == gold or (len(gold) > qa.MAX_LIST and got <= gold and f.get('so_luong') == len(gold))
        return ok, note + f' · đáp án {sorted(gold)[:6]} ({len(gold)})'
    if c['check'] == 'count':
        ok = f.get('so_luong') == gold or re.search(r'(?<!\d)' + str(gold) + r'(?!\d)', ans) is not None
        return ok, note + f' · đáp án {gold}'
    if c['check'] == 'text':
        miss = [t for t in gold if t and fold(t) not in ans]
        return not miss, note + (f' · thiếu {miss}' if miss else '') + f' · {out.get("answer", "")[:80]}'
    if c['check'] == 'order':
        return sh[:len(gold)] == gold, note + f' · đáp án {gold}'
    return False, note


def run(args) -> int:
    fx = json.loads(Path(args.fixture).read_text(encoding='utf-8'))
    rows = build_rows(fx)
    qa._today = lambda: TODAY
    settings.embed_model = ''
    if args.mode == 'mock':
        settings.mode = 'mock'
    elif settings.mode != 'vllm':
        print('Chế độ live cần AI_MODE=vllm trong server/.env')
        return 2
    res, lat = [], []
    for c in cases(rows):
        if args.only and c['group'] != args.only:
            continue
        t = time.time()
        out = qa.ask(c['q'], rows)
        lat.append(time.time() - t)
        ok, note = judge(c, out, rows)
        res.append({**c, 'ok': ok, 'note': note})
        if args.verbose or not ok:
            print(('  ok  ' if ok else '  LỖI ') + f"[{c['group']}] {c['q']}  → {note}")
            if not ok:
                print('        spec Agent chọn:', json.dumps(out.get('route'), ensure_ascii=False), '· bởi', out.get('routedBy') or out.get('by'))

    def sc(g):
        r = [x for x in res if x['group'] == g]
        return sum(1 for x in r if x['ok']), len(r)
    lines = [f'# Đánh giá câu hỏi nhiều bước — {args.mode} — {datetime.now():%d/%m/%Y %H:%M}', '',
             f'Dữ liệu: {len(rows)} dự án. Ngày chuẩn: {TODAY:%d/%m/%Y}.', '', '| Nhóm | Đạt |', '|---|---|']
    for g, label in (('one', 'one — một đặc tả là đủ'), ('dep', 'dep — phụ thuộc bước trước / hợp / phủ định / so sánh')):
        a, b = sc(g)
        if b:
            lines.append(f'| {label} | {a}/{b} ({100 * a / b:.0f}%) |')
    if lat:
        lines.append(f'\nThời gian mỗi câu: P50 {statistics.median(lat):.2f}s · lớn nhất {max(lat):.2f}s')
    a, b = sc('dep')
    if b:
        lines.append('\nGợi ý quyết định: ' + ('nhóm dep < 60% → đáng làm vòng tool-calling.' if a / b < 0.6 else 'nhóm dep ≥ 60% → giữ kiến trúc hiện tại, chỉ sửa các ca lỗi.'))
    text = '\n'.join(lines)
    print('\n' + text)
    out_dir = HERE / 'out'
    out_dir.mkdir(exist_ok=True)
    (out_dir / f'multistep-{args.mode}-{datetime.now():%Y%m%d-%H%M}.md').write_text(text, encoding='utf-8')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['mock', 'live'], default='mock')
    ap.add_argument('--fixture', default=str(DEFAULT_FIXTURE))
    ap.add_argument('--only', choices=['one', 'dep'])
    ap.add_argument('--verbose', action='store_true')
    sys.exit(run(ap.parse_args()))

"""Đánh giá Trợ lý hỏi đáp (chatbot RAG) trên 56 dự án của bộ dữ liệu sạch `jira-rows.json`. Chưa nói tới Agent sửa bảng.

Chạy (ở thư mục server, đã mở venv):
    python -m evals.qa_eval                       # offline: luật + tìm theo từ khoá, không gọi AI
    python -m evals.qa_eval --mode live           # gọi V-LLM thật (router + lời văn), cần server/.env có AI_MODE=vllm
    python -m evals.qa_eval --only rag --verbose  # chỉ nhóm tìm theo nội dung, in từng ca

Đáp án (gold) được tính bằng mã riêng của file này từ dữ liệu, KHÔNG dùng hàm của qa.py, để không tự chấm bài mình.
Các nhóm ca:
  struct   — câu số liệu: đếm, lọc, nhóm, hạn, top N, người phụ trách (đáp án = tính độc lập từ dữ liệu)
  rag      — hỏi theo nội dung (viết lại bằng lời khác, không chép nguyên văn): tìm đúng dự án trong 8 đoạn đầu
  hard     — diễn đạt khác từ trong bảng (đồng nghĩa): đo độ yếu của tìm từ khoá, KHÔNG tính vào điểm chính
  none     — chủ đề bảng không có: phải nói chưa tìm thấy, không bịa
  detail   — hỏi một trường của một dự án có mã (KPI, mục tiêu, milestone…)
  follow   — câu nối tiếp ("dự án đó…") dùng bộ nhớ hội thoại
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
import unicodedata
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from server.app.ai import rag  # noqa: E402
from server.app.ai.agent import qa  # noqa: E402
from server.app.ai.settings import settings  # noqa: E402

TODAY = date(2026, 11, 26)
DEFAULT_FIXTURE = HERE.parents[1] / 'client' / 'src' / '__tests__' / 'fixtures' / 'jira-rows.json'
STATUS = {'IN PROGRESS': 'Đang thực hiện', 'DONE': 'Hoàn thành', 'TO DO': 'Chưa bắt đầu', 'PENDING': 'Tạm dừng', 'MONITORING': 'Theo dõi'}
PROGRESS = {'On track': 'Đúng tiến độ', 'At risk': 'Có nguy cơ chậm', 'Late': 'Chậm tiến độ', 'Not tracking': 'Không theo dõi'}


def fold(s: str) -> str:
    s = unicodedata.normalize('NFD', (s or '').lower().replace('đ', 'd'))
    return re.sub(r'\s+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn'))


def parse_date(s: str) -> date | None:
    try:
        return datetime.strptime(s, '%d/%m/%Y').date()
    except (TypeError, ValueError):
        return None


def build_rows(fx: dict) -> list[dict]:
    """Dựng dòng giống giao diện gửi lên: giá trị hiển thị + các cột chữ."""
    out = []
    for r in fx['rows']:
        weeks = r.get('prw') or {}
        keys = sorted(weeks)
        cur = weeks[keys[-1]] if keys else {}
        prev = [f"Tuần {k[1:]} – đã làm: {weeks[k].get('done', '')}; kế hoạch: {weeks[k].get('plan', '')}" for k in keys[-3:-1]]
        blockers = re.findall(r'Blockers?:\s*([^\n]+)', cur.get('done', '') or '')
        out.append({
            'code': r['ma'], 'name': r['viec'], 'group': fx['mang'].get(r['g'], ''), 'status': STATUS.get(r['rawStatus'], r['rawStatus']),
            'progress': PROGRESS.get(r['rawProgress'], r['rawProgress']), 'risk': '', 'pic': r.get('tl') or (r.get('assignees') or [''])[0],
            'start': r.get('start', ''), 'end': r.get('end', ''), 'pending': False,
            'goal': r.get('muctieu', ''), 'kpi': r.get('kpi', ''), 'milestone': r.get('milestone', ''), 'note': '',
            'done': cur.get('done', ''), 'plan': cur.get('plan', ''), 'issue': '; '.join(blockers), 'prev': '\n'.join(prev), 'comment': r.get('comment') or '',
        })
    return out


# ---------- đáp án độc lập ----------
def codes_where(rows: list[dict], pred) -> set[str]:
    return {r['code'] for r in rows if pred(r)}


def has_text(rows: list[dict], needle: str) -> set[str]:
    n = fold(needle)
    return {r['code'] for r in rows if any(n in fold(r.get(f, '')) for f in ('name', 'goal', 'kpi', 'milestone', 'done', 'plan', 'issue', 'prev', 'comment'))}


def struct_cases(rows: list[dict]) -> list[dict]:
    fin = {'Hoàn thành'}
    due = lambda r: parse_date(r['end'])
    late = codes_where(rows, lambda r: r['progress'] == 'Chậm tiến độ')
    cases = [
        ('dự án nào đang chậm?', {'count': len(late), 'set': late}),
        ('có bao nhiêu dự án đúng tiến độ', {'count': len(codes_where(rows, lambda r: r['progress'] == 'Đúng tiến độ'))}),
        ('dự án nào có nguy cơ trễ?', {'count': len(codes_where(rows, lambda r: r['progress'] == 'Có nguy cơ chậm')), 'set': codes_where(rows, lambda r: r['progress'] == 'Có nguy cơ chậm')}),
        ('liệt kê các dự án đã hoàn thành', {'count': len(codes_where(rows, lambda r: r['status'] == 'Hoàn thành'))}),
        ('có bao nhiêu dự án đang thực hiện', {'count': len(codes_where(rows, lambda r: r['status'] == 'Đang thực hiện'))}),
        ('dự án nào đang tạm dừng', {'count': 1, 'set': codes_where(rows, lambda r: r['status'] == 'Tạm dừng')}),
        ('tóm tắt tuần này', {'count': len(rows)}),
        ('dự án nào quá hạn?', {'count': len(codes_where(rows, lambda r: due(r) and due(r) < TODAY and r['status'] not in fin))}),
        ('dự án nào đến hạn trong 14 ngày tới', {'count': len(codes_where(rows, lambda r: due(r) and TODAY <= due(r) <= date.fromordinal(TODAY.toordinal() + 14) and r['status'] not in fin))}),
        ('dự án chậm và đang thực hiện', {'count': len(codes_where(rows, lambda r: r['progress'] == 'Chậm tiến độ' and r['status'] == 'Đang thực hiện'))}),
    ]
    people = sorted({r['pic'] for r in rows if r['pic']})
    if people:
        p = max(people, key=lambda x: sum(1 for r in rows if r['pic'] == x))
        cases.append((f'{p} phụ trách dự án nào', {'count': sum(1 for r in rows if r['pic'] == p), 'person': p}))
    nearest = sorted((r for r in rows if due(r) and r['status'] not in fin), key=lambda r: due(r))[:3]
    cases.append(('3 dự án có hạn gần nhất', {'first': [r['code'] for r in nearest], 'top': 3, 'dates': [r['end'] for r in nearest]}))
    return [{'kind': 'struct', 'q': q, **exp} for q, exp in cases]


def rag_cases(rows: list[dict]) -> list[dict]:
    """Câu hỏi viết lại bằng lời khác; gold = các dự án mà người đọc bảng cho là đúng (đọc từ dữ liệu)."""
    G = [
        ('dự án nào làm về nhận diện khuôn mặt tài xế', {'I.A.6.2'}), ('dự án nào liên quan đến định giá động', {'I.C.2.1', 'I.C.2.2', 'I.C.2.3'}),
        ('nền tảng thực nghiệm A/B là dự án nào', {'I.A.5.1'}), ('dự án nào dự báo tài xế nghỉ việc', {'II.A.2.2'}),
        ('dự án về xe buýt shuttle', {'I.1.6.10'}), ('có dự án nào dùng Computer Vision để kiểm tra xe', {'I.1.7.3'}),
        ('dự án nào giám sát GPU', {'II.E.1.5'}), ('dự án nào liên quan sân bay', {'I.C.1.6', 'I.C.1.12', 'I.C.1.9', 'I.2.3.1'}),
        ('dự án nào làm Feature Store', {'II.E.1.1'}), ('dự án nào về bảo dưỡng pin xe điện', {'II.B.1.1', 'I.C.1.7'}),
        ('đối soát doanh thu với kế toán là dự án nào', {'I.1.7.5'}), ('dự án nào phát hiện gian lận', {'II.D.1.2'}),
        ('dự án nào làm CI/CD triển khai mô hình', {'II.E.1.2'}), ('dự án về Push Notification', {'I.A.5.3'}),
        ('dự án nào dùng Causal Uplift', {'I.A.5.2'}), ('hệ thống SOS khẩn cấp thuộc dự án nào', {'I.1.6.1'}),
        ('Driver Copilot là gì', {'II.A.2.1'}), ('dự án đào tạo trực tuyến cho tài xế', {'I.4.3.1'}),
        ('dự án phân tích sắc thái phản hồi khách hàng', {'I.4.3.2'}), ('dự án nào xử lý mưa ngập giao thông', {'I.1.4.1'}),
        ('dự án nào cần PMO hỗ trợ escalate lịch họp duyệt', has_text(rows, 'escalate')), ('dự án nào phụ thuộc dữ liệu API từ hệ thống vệ tinh', has_text(rows, 'hệ thống vệ tinh')),
        ('dự án nào bị rủi ro lưu lượng tăng đột biến cuối tuần', has_text(rows, 'Lưu lượng tăng đột biến')),
        ('dự án nào đang cần xác nhận lại ngưỡng KPI vận hành', has_text(rows, 'ngưỡng KPI vận hành')),
        ('dự án nào tối ưu ghép đơn Food', {'I.A.4.1'}), ('dự án nào về hàng đợi ảo cho sân bay', {'I.C.1.6'}),
    ]
    return [{'kind': 'rag', 'q': q, 'gold': sorted(g)} for q, g in G if g]


HARD = [  # diễn đạt khác hẳn từ trong bảng (đồng nghĩa / khái niệm): tìm từ khoá thường yếu
    ('dự án nào giúp tài xế bỏ việc ít hơn', {'II.A.2.2'}), ('dự án nào giảm chi phí hạ tầng máy chủ AI', {'II.E.1.5'}),
    ('dự án nào chống gian lận khuyến mãi', {'II.D.1.2'}), ('dự án nào cải thiện thời gian chờ xe', {'I.C.1.5', 'I.C.1.1', 'I.C.1.2'}),
    ('dự án nào giúp xe điện đỡ hỏng pin', {'II.B.1.1'}), ('dự án nào bảo vệ an toàn hành khách', {'I.A.6.1', 'I.1.6.1', 'I.A.6.2'}),
]
NONE = ['dự án nào làm về blockchain', 'có dự án nào dùng máy tính lượng tử không', 'dự án nào làm robot giao hàng tự lái', 'dự án nào về metaverse']
DETAIL = [  # (câu hỏi, cụm chữ phải xuất hiện trong câu trả lời)
    ('KPI của I.A.4.1 là gì', 'Uptime >= 99.5%'), ('mục tiêu của I.C.1.5 là gì', 'MAE'), ('milestone của I.A.4.1', 'Nghiệm thu và bàn giao'),
    ('I.A.4.1 đang gặp vấn đề gì', 'độ trễ dữ liệu giờ cao điểm'), ('I.A.4.1 đang thế nào', 'Dynamic Batching'),
]
FOLLOW = [  # (câu 1, câu 2, điều kiện của câu 2)
    ('dự án nào đang chậm?', 'dự án đó là dự án gì', 'name'), ('dự án nào có nguy cơ trễ?', 'trong số đó dự án nào đang thực hiện', 'subset'),
]


# ---------- chấm ----------
def codes_in(text: str, rows: list[dict]) -> set[str]:
    return {r['code'] for r in rows if re.search(r'(?<![\w.])' + re.escape(r['code']) + r'(?!\w)(?!\.\d)', text)}


def shown(out: dict) -> list[str]:
    f = out.get('facts') or {}
    if f.get('doan'):
        seen: list[str] = []
        for d in f['doan']:
            if d['code'] not in seen:
                seen.append(d['code'])
        return seen
    d = f.get('du_an')
    return [x['code'] for x in d] if isinstance(d, list) else ([d['code']] if isinstance(d, dict) else [])


def pct(a: int, b: int) -> str:
    return f'{a}/{b} ({100 * a / b:.0f}%)' if b else 'n/a'


def run(args) -> int:
    fx = json.loads(Path(args.fixture).read_text(encoding='utf-8'))
    rows = build_rows(fx)
    clean = qa._clean_rows(rows)
    qa._today = lambda: TODAY
    settings.embed_model = ''                      # chỉ đo tìm theo từ khoá (tenant chưa có model embedding)
    if args.mode == 'mock':
        settings.mode = 'mock'
    elif settings.mode != 'vllm':
        print('Chế độ live cần AI_MODE=vllm trong server/.env'); return 2
    results, lat, grounded_bad = [], [], []

    def ask(q, history=None):
        t = time.time()
        out = qa.ask(q, rows, history=history)
        lat.append(time.time() - t)
        bad = codes_in(out.get('answer', ''), clean) - {c for c in shown(out)} - set(out.get('scope') or [])
        if bad and out['intent'] != 'unknown':
            grounded_bad.append((q, sorted(bad)))
        return out

    def rec(kind, q, ok, note=''):
        results.append({'kind': kind, 'q': q, 'ok': ok, 'note': note})
        if args.verbose or not ok:
            print(('  ok  ' if ok else '  LỖI ') + f'[{kind}] {q}' + (f'  → {note}' if note else ''))

    want = lambda k: args.only in (None, k)
    # struct
    if want('struct'):
        for c in struct_cases(rows):
            out = ask(c['q']); f = out.get('facts') or {}; sh = shown(out)
            ok, note = True, f"intent={out['intent']} so_luong={f.get('so_luong')}"
            if 'count' in c and f.get('so_luong', f.get('tong')) != c['count']:
                ok, note = False, note + f" · đáp án {c['count']}"
            if 'set' in c and (set(sh) != c['set'] if len(c['set']) <= 12 else False):
                ok, note = False, note + f" · hiện {sh} ≠ {sorted(c['set'])}"
            if 'first' in c and sh[:3] != c['first']:
                ok, note = False, note + f" · hiện {sh[:3]} ≠ {c['first']}"
            if 'person' in c and not sh:
                ok, note = False, note + ' · không lọc theo người'
            rec('struct', c['q'], ok, note)
    # rag
    rr: list[tuple[int | None, set, list[str]]] = []
    if want('rag'):
        for c in rag_cases(rows):
            got = rag.search(c['q'], clean, lambda s: s, {})
            codes: list[str] = []
            for p in got['passages']:
                if p['code'] not in codes:
                    codes.append(p['code'])
            gold = set(c['gold']); rank = next((i + 1 for i, x in enumerate(codes) if x in gold), None)
            rr.append((rank, gold, codes))
            out = ask(c['q'])
            routed = out['intent']
            rec('rag', c['q'], rank is not None, f"hạng đúng đầu tiên={rank} · gold={sorted(gold)[:3]}{'…' if len(gold) > 3 else ''} · hiện {codes[:4]} · route={routed}/{out.get('routedBy')}")
    # hard
    hr = []
    if want('hard'):
        for q, gold in HARD:
            got = rag.search(q, clean, lambda s: s, {})
            codes = list(dict.fromkeys(p['code'] for p in got['passages']))
            rank = next((i + 1 for i, x in enumerate(codes) if x in gold), None)
            hr.append(rank)
            if args.verbose:
                print(f"  {'ok  ' if rank else 'trượt'} [hard] {q} → hạng {rank} · hiện {codes[:3]}")
    # none
    if want('none'):
        for q in NONE:
            out = ask(q); f = out.get('facts') or {}
            ok = (f.get('kieu') == 'search' and not f.get('tim_thay')) or out['intent'] == 'unknown'
            rec('none', q, ok, f"intent={out['intent']} tim_thay={f.get('tim_thay')} · {shown(out)[:3]}")
    # detail
    if want('detail'):
        for q, must in DETAIL:
            out = ask(q); text = out['answer'] + ' ' + json.dumps(out.get('facts') or {}, ensure_ascii=False)
            rec('detail', q, fold(must) in fold(text), f"intent={out['intent']} · cần có \"{must}\" · {out['answer'][:90]}")
    # follow
    if want('follow'):
        for q1, q2, how in FOLLOW:
            o1 = ask(q1); hist = [{'q': q1, 'codes': o1.get('scope') or []}]
            o2 = ask(q2, hist); s1 = set(o1.get('scope') or [])
            ok = bool(s1) and (set(shown(o2)) <= s1 and bool(shown(o2)))
            rec('follow', f'{q1}  ⇒  {q2}', ok, f"intent={o2['intent']} · {shown(o2)[:4]} · phạm vi trước {sorted(s1)[:4]}")

    # ---- tổng kết ----
    def score(k):
        r = [x for x in results if x['kind'] == k]
        return sum(1 for x in r if x['ok']), len(r)
    lines = [f"# Đánh giá Trợ lý hỏi đáp (RAG) — {args.mode} — {datetime.now():%d/%m/%Y %H:%M}", '',
             f'Dữ liệu: {len(rows)} dự án ({fx["file"]}). Ngày chuẩn cho hạn: {TODAY:%d/%m/%Y}. Embeddings: tắt (chỉ từ khoá).', '', '| Nhóm | Kết quả |', '|---|---|']
    for k, label in [('struct', 'Số liệu (đếm, lọc, nhóm, hạn, top N, người)'), ('none', 'Chủ đề không có: nói chưa tìm thấy'), ('detail', 'Hỏi trường của dự án có mã'), ('follow', 'Câu nối tiếp (bộ nhớ)')]:
        a, b = score(k)
        if b:
            lines.append(f'| {label} | {pct(a, b)} |')
    if rr:
        n = len(rr)
        lines.append(f"| Tìm theo nội dung — đúng trong 8 đoạn đầu | {pct(sum(1 for x in rr if x[0]), n)} |")
        lines.append(f"| Tìm theo nội dung — đúng ở hạng 1 | {pct(sum(1 for x in rr if x[0] == 1), n)} |")
        lines.append(f"| Tìm theo nội dung — đúng trong 3 đầu | {pct(sum(1 for x in rr if x[0] and x[0] <= 3), n)} |")
        mrr = statistics.mean((1 / x[0]) if x[0] else 0 for x in rr)
        prec = statistics.mean(len(set(x[2][:5]) & x[1]) / max(1, len(x[2][:5])) for x in rr)
        lines.append(f'| Tìm theo nội dung — MRR / độ chính xác trong 5 đầu | {mrr:.2f} / {prec:.2f} |')
    if hr:
        lines.append(f"| Diễn đạt khác hẳn (đồng nghĩa) — đúng trong 8 đoạn đầu | {pct(sum(1 for x in hr if x), len(hr))} |")
    lines += ['', f'Đđáp có mã dự án ngoài số liệu (bịa mã): {len(grounded_bad)}' + (f' → {grounded_bad[:3]}' if grounded_bad else ''),
              f'Thời gian mỗi câu: P50 {statistics.median(lat):.2f}s · P95 {sorted(lat)[int(0.95 * (len(lat) - 1))]:.2f}s · lớn nhất {max(lat):.2f}s ({len(lat)} lần hỏi)' if lat else '']
    lines[-2] = lines[-2].replace('Đđáp', 'Câu trả lời')
    fails = [x for x in results if not x['ok']]
    if fails:
        lines += ['', '## Ca lỗi', *[f"- [{x['kind']}] {x['q']} → {x['note']}" for x in fails]]
    text = '\n'.join(lines)
    print('\n' + text)
    out_dir = HERE / 'out'; out_dir.mkdir(exist_ok=True)
    (out_dir / f'qa-{args.mode}-{datetime.now():%Y%m%d-%H%M}.md').write_text(text, encoding='utf-8')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['mock', 'live'], default='mock')
    ap.add_argument('--fixture', default=str(DEFAULT_FIXTURE))
    ap.add_argument('--only', choices=['struct', 'rag', 'hard', 'none', 'detail', 'follow'])
    ap.add_argument('--verbose', action='store_true')
    sys.exit(run(ap.parse_args()))

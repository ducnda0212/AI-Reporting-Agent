"""Bộ câu hỏi có ĐÁP ÁN TÍNH BẰNG CODE từ một file Jira thật, để đo chatbot trả lời đúng bao nhiêu.

Đáp án không viết tay: mỗi ca tự tính từ chính file (đếm, lọc, tìm cụm chữ), nên đổi file là đổi đáp án theo.
Dòng gửi cho Trợ lý được dựng giống hệt giao diện (client/src/store/actions/ai.ts agentRow): tiến độ theo exTT,
"tuần này" là tuần hiện tại của kỳ, mỗi ô chữ cắt còn 1200 ký tự.

Chạy (thư mục server, đã mở venv):
    python -m evals.qa_truth                       # in đáp án + chấm tầng code (không gọi AI, AI_MODE=mock)
    python -m evals.qa_truth --mode live           # chấm V-LLM thật (cần AI_MODE=vllm)
    python -m evals.qa_truth --mode live --verbose # in cả câu trả lời
    python -m evals.qa_truth --file <đường dẫn csv/xlsx> --cycle 2026_11_w4 --today 2026-11-25
Mặc định: storage/fixtures/jira_64da.csv, kỳ 2026_11_w4, hôm nay 25/11/2026 (ngày xuất file).

Loại ca:
  so      : câu trả lời phải có con số đúng
  ma      : phải nêu đủ các mã dự án đúng (đọc ở mã trong câu, codes và scope của phản hồi)
  chu     : phải có các cụm chữ lấy từ ô của dự án
  thieu_du_lieu : chatbot chưa có cách trả lời đúng (dữ liệu chưa gửi hoặc chưa quy đổi).
            Không tính điểm; ghi lại để biết chỗ cần bổ sung, và chatbot phải nói không biết thay vì bịa.
"""
from __future__ import annotations

import argparse
import re
import sys
import time
import unicodedata
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from server.app.modules.ingestion.cycles import current_week, reference_date, weeks_for_cycle  # noqa: E402
from server.app.modules.mapping.catalog import load_catalog  # noqa: E402
from server.app.modules.mapping.reconciler import reconcile_issues  # noqa: E402
from server.app.modules.mapping.resolved import resolve_mapping  # noqa: E402
from server.app.modules.mapping.tabular_reader import read_tabular  # noqa: E402

DEFAULT_FILE = HERE.parent / 'storage' / 'fixtures' / 'jira_64da.csv'
DEFAULT_CYCLE = '2026_11_w4'
DEFAULT_TODAY = date(2026, 11, 25)
MAX_TEXT = 1200          # client REMOTE_MAX_TEXT = server rag.MAX_FIELD_CHARS
SOON_DAYS = 14           # client exTT: còn ≤ 14 ngày tới hạn là "Có nguy cơ chậm"
WK_TXT = {'w1': ('w1ht', 'w1kh', 'w1vd'), 'w2': ('w2ht', 'w2kh', 'w2vd'), 'w3': ('ht', 'kh', 'vd'), 'w4': ('w4ht', 'w4kh', 'w4vd')}
TEXT_OF_ROW = ('muctieu', 'kpi', 'milestone', 'note', *(f for k in WK_TXT.values() for f in k), 'comment')
FINISHED = {'Đã hoàn thành', 'Hủy'}
PROGRESS_SAY = {   # cách nói tương đương của từng giá trị Tiến độ
    'Đúng tiến độ': ('Đúng tiến độ', 'đúng kế hoạch', 'on track', 'đúng hạn'),
    'Chậm tiến độ': ('Chậm tiến độ', 'chậm', 'trễ', 'late'),
    'Có nguy cơ chậm': ('Có nguy cơ chậm', 'nguy cơ', 'có rủi ro', 'at risk'),
}
CODE_RE = re.compile(r'\b[IVX]+\.[A-Z0-9]+\.\d+(?:\.\d+)?\b|\bx\.x\.\d+\b')


# ---------- dữ liệu ----------

def load_report_rows(path: Path, cycle: str) -> list:
    """File Jira -> các dòng báo cáo, qua đúng các bước đọc file / đối chiếu của máy chủ (không cần cơ sở dữ liệu)."""
    tab = read_tabular(Path(path).read_bytes(), Path(path).name)
    rows, _ = reconcile_issues(tab.records, load_catalog(), weeks_for_cycle(cycle), resolve_mapping(None), None, reference_date(cycle))
    return rows


def _vn(s: str) -> date | None:
    try:
        return datetime.strptime((s or '').strip(), '%d/%m/%Y').date()
    except ValueError:
        return None


def progress_of(r, today: date) -> str:
    """Bản Python của exTT (client/src/lib/ai.ts): cột Tiến độ mà giao diện gửi cho Trợ lý.
    Dự án đã xong / huỷ không bị tính chậm hay sắp tới hạn theo ngày; Jira ghi "Có rủi ro" là có nguy cơ chậm."""
    due = _vn(r.end)
    open_ = r.tt not in FINISHED
    if r.td == 'Chậm tiến độ' or (open_ and due and due < today):
        return 'Chậm tiến độ'
    if r.td == 'Có rủi ro' or (open_ and due and (due - today).days <= SOON_DAYS) or r.rui == 'Cao':
        return 'Có nguy cơ chậm'
    return 'Đúng tiến độ'


SUB_DONE = re.compile(r'^(done|closed|resolved|đã hoàn thành|hoàn thành)$', re.I)


def subtask_text(subs) -> str:
    """Bản Python của subtaskText (client/src/lib/agentRemote.ts)."""
    if not subs:
        return ''
    done = sum(1 for t in subs if SUB_DONE.match((t.status or '').strip()))
    lines = [f'{done}/{len(subs)} subtask đã xong, còn {len(subs) - done} chưa xong']
    lines += [f"- {(t.summary or '').strip()} ({(t.status or '').strip() or 'chưa rõ trạng thái'})" for t in subs]
    return '\n'.join(lines)[:MAX_TEXT]


def agent_rows(rows: list, today: date, wk: str) -> list[dict]:
    """Dòng gửi cho Trợ lý, giống agentRow + textColumns ở giao diện."""
    cut = lambda s: (s or '').strip()[:MAX_TEXT]  # noqa: E731
    out = []
    for r in rows:
        ht, kh, vd = WK_TXT[wk]
        prev = []
        for k in ('w1', 'w2', 'w3', 'w4'):
            if k == wk:
                continue
            parts = [f'{n}: {getattr(r, f).strip()}' for n, f in zip(('đã làm', 'kế hoạch', 'vấn đề'), WK_TXT[k]) if getattr(r, f).strip()]
            if parts:
                prev.append(f'Tuần {k[1]} – ' + '; '.join(parts))
        out.append({'code': r.ma, 'name': r.viec, 'group': r.mang, 'status': r.tt, 'progress': progress_of(r, today), 'risk': r.rui,
                    'pic': r.pic, 'start': r.start, 'end': r.end, 'pending': False,
                    'goal': cut(r.muctieu), 'kpi': cut(r.kpi), 'milestone': cut(r.milestone), 'note': cut(r.note),
                    'done': cut(getattr(r, ht)), 'plan': cut(getattr(r, kh)), 'issue': cut(getattr(r, vd)),
                    'prev': cut('\n'.join(prev)), 'comment': cut(r.comment),
                    'step': r.buoc, 'priority': r.prio, 'jiraProgress': (r.rawProgress or '').strip(), 'subtasks': subtask_text(r.subtasks)})
    return out


def plain(s: str) -> str:
    s = unicodedata.normalize('NFD', (s or '').lower().replace('đ', 'd'))
    return re.sub(r'\s+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


def _full_text(r) -> str:
    return '\n'.join(getattr(r, f) for f in TEXT_OF_ROW)


def _sent_text(a: dict) -> str:
    return '\n'.join(a[k] for k in ('name', 'goal', 'kpi', 'milestone', 'note', 'done', 'plan', 'issue', 'prev', 'comment', 'subtasks'))


# ---------- ca kiểm thử (đáp án tính từ file) ----------

def _case(cid, q, kind, expect, note='', **kw):
    return {'id': cid, 'q': q, 'kind': kind, 'expect': expect, 'note': note, **kw}


def _strip_date(s: str) -> str:
    return re.sub(r'^\s*\[\d{4}-\d{2}-\d{2}\]\s*', '', s or '')


def _phrase_codes(rows, arows, phrase: str) -> tuple[list[str], list[str]]:
    """Mã có cụm chữ trong ô (bản đầy đủ) và mã mà Trợ lý thực sự nhận được cụm đó (sau khi cắt 1200 ký tự)."""
    p = plain(phrase)
    full = [r.ma for r in rows if p in plain(_full_text(r))]
    sent = [a['code'] for a in arows if p in plain(_sent_text(a))]
    return full, sent


def _words(s: str) -> list[str]:
    return [w for w in re.split(r'[\s,.;:()\[\]\-–/•→≥≤%]+', _strip_date(s)) if len(w) >= 4 and not w.isdigit()]


def _rare_words(s: str, others: list[str], n: int = 3) -> list[str]:
    """Vài từ đặc trưng của một ô: từ ít xuất hiện nhất trong cùng ô của các dự án khác (bỏ "mục tiêu", "tiến độ"… lặp ở mọi dự án).
    Giữ thứ tự xuất hiện trong ô để đáp án dễ đọc."""
    words = list(dict.fromkeys(_words(s)))
    df = {w: sum(plain(w) in plain(o) for o in others) for w in words}
    keep = set(sorted(words, key=lambda w: (df[w], -len(w)))[:n])
    return [w for w in words if w in keep]


def build_cases(rows: list, arows: list[dict], today: date, wk: str) -> list[dict]:
    by = {r.ma: r for r in rows}
    a_by = {a['code']: a for a in arows}
    st = Counter(r.tt for r in rows)
    prog = Counter(a['progress'] for a in arows)
    groups = Counter(r.g for r in rows)
    top_group, top_n = groups.most_common(1)[0]
    pics = Counter(r.pic for r in rows if r.pic)
    pic1 = sorted(pics, key=lambda p: (-pics[p], p))[0]
    running = [r for r in rows if r.tt not in FINISHED]
    overdue = sorted(r.ma for r in running if (d := _vn(r.end)) and d < today)
    soon = sorted(r.ma for r in running if (d := _vn(r.end)) and today <= d <= today + timedelta(days=SOON_DAYS))
    # dự án mẫu cho câu hỏi về một dự án: dự án đầu tiên có đủ nội dung tuần này, tuần trước và comment
    wk_done, wk_plan, _ = WK_TXT[wk]
    prev_wk = {'w2': 'w1', 'w3': 'w2', 'w4': 'w3'}.get(wk, '')
    sample = next((r for r in rows if getattr(r, wk_done) and getattr(r, wk_plan) and r.comment and r.kpi and (not prev_wk or getattr(r, WK_TXT[prev_wk][0]))), rows[0])
    s_code, s_name = sample.ma, sample.viec
    last_comment = sample.comment.strip().split('\n')[-1].split(';', 2)[-1]   # comment dạng 'ngày;người;nội dung', lấy nội dung dòng cuối
    cases = [
        _case('C01', 'Tuần này có bao nhiêu dự án?', 'so', len(rows)),
        _case('C02', 'Bao nhiêu dự án đã hoàn thành?', 'so', st['Đã hoàn thành']),
        _case('C03', 'Dự án nào chưa thực hiện?', 'ma', sorted(r.ma for r in rows if r.tt == 'Chưa thực hiện')),
        _case('C04', 'Dự án nào đang tạm dừng?', 'ma', sorted(r.ma for r in rows if r.tt == 'Tạm dừng')),
        _case('C05', 'Có bao nhiêu dự án chậm tiến độ?', 'so', prog['Chậm tiến độ'], 'cách giao diện tính: quá hạn mà chưa xong, hoặc cột Tiến độ = Chậm'),
        _case('C06', 'Có bao nhiêu dự án có nguy cơ chậm?', 'so', prog['Có nguy cơ chậm'], f'chưa xong và còn ≤ {SOON_DAYS} ngày tới hạn, hoặc Tiến độ = Có rủi ro'),
        _case('C07', 'Dự án nào đã quá hạn mà chưa xong?', 'ma', overdue),
        _case('C08', f'Dự án nào đến hạn trong {SOON_DAYS} ngày tới?', 'ma', soon),
        _case('C09', f'Nhóm {top_group} có mấy dự án?', 'so', top_n),
        _case('C10', 'Nhóm nào có nhiều dự án nhất?', 'chu', [top_group], f'{top_group}: {top_n} dự án'),
        _case('C11', f'{pic1} phụ trách những dự án nào?', 'ma', sorted(r.ma for r in rows if r.pic == pic1)),
        _case('C12', f'{pic1} có bao nhiêu dự án?', 'so', pics[pic1]),
        _case('C13', f'Dự án {s_code} hạn khi nào?', 'chu', [sample.end]),
        _case('C14', f'Dự án {s_name} đang tiến độ thế nào?', 'chu', [s_code, PROGRESS_SAY.get(a_by[s_code]['progress'], (a_by[s_code]['progress'],))], 'hỏi theo tên, không có mã'),
        _case('C15', f'{s_code} tuần này đã làm được gì?', 'chu', _rare_words(getattr(sample, wk_done), [getattr(r, wk_done) for r in rows if r is not sample]), f'ô "đã làm" tuần {wk[1]}'),
        _case('C16', f'Kế hoạch tiếp theo của {s_code} là gì?', 'chu', _rare_words(getattr(sample, wk_plan), [getattr(r, wk_plan) for r in rows if r is not sample]), f'ô "kế hoạch" tuần {wk[1]}'),
        _case('C17', f'KPI của dự án {s_code} là gì?', 'chu', _rare_words(sample.kpi, [r.kpi for r in rows if r is not sample])),
        _case('C18', f'Comment gần nhất của {s_code} nói gì?', 'chu', _rare_words(last_comment, [r.comment for r in rows if r is not sample])),
    ]
    if prev_wk:
        cases.append(_case('C19', f'Tuần {prev_wk[1]} dự án {s_code} đã làm gì?', 'chu', _rare_words(getattr(sample, WK_TXT[prev_wk][0]), [getattr(r, WK_TXT[prev_wk][0]) for r in rows if r is not sample]), 'nằm trong "các tuần trước"'))
    # tìm theo nội dung: cụm chữ có thật trong file, đáp án = mọi dự án có cụm đó
    for cid, q, phrase in (('C20', 'Dự án nào đang chờ rà soát bảo mật từ ANBM?', 'rà soát bảo mật'),
                           ('C21', 'Dự án nào đang bám đội phụ thuộc để chốt bản vá?', 'chốt bản vá'),
                           ('C22', 'Dự án nào nhắc tới GPU?', 'GPU'),
                           ('C23', 'Dự án nào cần PMO hỗ trợ escalate?', 'escalate')):
        full, sent = _phrase_codes(rows, arows, phrase)
        if full:
            cases.append(_case(cid, q, 'ma', sorted(sent), f'cụm "{phrase}"' + (f'; {len(set(full) - set(sent))} dự án có cụm này nhưng bị cắt khi gửi' if set(full) - set(sent) else '')))
    # bước, ưu tiên, subtask: giao diện gửi thêm từ 28/11/2026
    open_subs = sum(1 for t in by[s_code].subtasks if not SUB_DONE.match((t.status or '').strip()))
    cases += [
        _case('C24', f'{s_code} đang ở bước nào?', 'chu', [sample.buoc], 'cột Bước (AJ)'),
        _case('C25', 'Có bao nhiêu dự án ưu tiên High?', 'so', sum(1 for r in rows if r.prio == 'High'), 'cột Ưu tiên (Z)'),
        _case('C26', f'{s_code} còn bao nhiêu subtask chưa xong?', 'so', open_subs, f'{len(by[s_code].subtasks)} subtask'),
    ]
    # Jira ghi "Late" = Chậm tiến độ (bảng quy đổi mặc định)
    cases.append(_case('C27', 'Dự án nào chậm tiến độ?', 'ma', sorted(a['code'] for a in arows if a['progress'] == 'Chậm tiến độ'),
                       'gồm các dự án Jira ghi Late'))
    return cases


# ---------- chấm ----------

def _codes_in(resp: dict) -> set[str]:
    text = ' '.join(str(resp.get(k) or '') for k in ('answer', 'lead'))
    return set(CODE_RE.findall(text)) | {str(c) for c in resp.get('codes') or []} | {str(c) for c in resp.get('scope') or []}


def score(case: dict, resp: dict) -> tuple[bool | None, str]:
    """(đạt?, giải thích). None = không tính điểm."""
    ans = plain(str(resp.get('answer') or '') + ' ' + str(resp.get('lead') or ''))
    kind, exp = case['kind'], case['expect']
    if kind == 'thieu_du_lieu':
        return None, 'không tính điểm (dữ liệu chưa gửi)'
    if kind == 'so':
        ok = re.search(rf'(?<!\d){exp}(?!\d)', ans) is not None or (exp == 0 and re.search(r'khong co|chua (tim thay|co)|khong tim thay', ans) is not None)
        return ok, '' if ok else f'thiếu số {exp}'
    if kind == 'ma':
        got = _codes_in(resp)
        if not exp:
            ok = not got or re.search(r'khong co|chua co|khong tim thay|(?<!\d)0 du an', ans) is not None
            return ok, '' if ok else 'đáp án là không có dự án nào'
        miss = [c for c in exp if c not in got]
        extra = sorted(got - set(exp))
        ok = not miss
        return ok, ('' if ok else f'thiếu {len(miss)}/{len(exp)}: {miss[:6]}') + (f' | thừa {extra[:6]}' if extra else '')
    if kind == 'chu':
        # mỗi mục là một cụm, hoặc một bộ cách nói tương đương (tuple); mã dự án đọc cả ở "codes"
        hay = ans + ' ' + plain(' '.join(_codes_in(resp)))
        hit = lambda w: any(plain(str(x)) in hay for x in (w if isinstance(w, tuple) else (w,)))  # noqa: E731
        miss = [w for w in exp if not hit(w)]
        need = 1 if len(exp) >= 3 else len(exp)   # 3 từ đặc trưng của một ô: câu tóm tắt có ít nhất một từ là đã dùng đúng ô đó
        ok = len(exp) - len(miss) >= need
        return ok, '' if ok else f'thiếu {miss}'
    return None, '?'


def run(mode: str, path: Path, cycle: str, today: date, verbose: bool = False, only: list[str] | None = None) -> int:
    from server.app.ai.agent import qa
    from server.app.ai.settings import settings
    if mode == 'live' and (settings.mode != 'vllm' or settings.problems()):
        print('Cần AI_MODE=vllm và cấu hình hợp lệ:', settings.problems() or 'đang là mock')
        return 2
    old_mode, old_today = settings.mode, qa._today
    if mode == 'offline':
        settings.mode = 'mock'
    qa._today = lambda: today   # cùng "hôm nay" với đáp án
    try:
        return _run(qa, path, cycle, today, verbose, only, mode)
    finally:
        settings.mode, qa._today = old_mode, old_today


def _run(qa, path: Path, cycle: str, today: date, verbose: bool, only: list[str] | None, mode: str) -> int:
    wk = f'w{current_week(cycle)}'
    rows = load_report_rows(path, cycle)
    arows = agent_rows(rows, today, wk)
    cases = [c for c in build_cases(rows, arows, today, wk) if not only or c['id'] in only]
    print(f'File {Path(path).name}: {len(rows)} dự án | kỳ {cycle} (tuần hiện tại {wk}) | hôm nay {today:%d/%m/%Y} | chế độ {mode}')
    passed = scored = 0
    times = []
    for c in cases:
        t0 = time.perf_counter()
        try:
            resp = qa.ask(c['q'], arows)
        except Exception as e:  # một ca lỗi không dừng cả bộ
            resp = {'answer': f'LỖI: {e}'}
        times.append(time.perf_counter() - t0)
        ok, why = score(c, resp)
        exp = c['expect'] if not isinstance(c['expect'], list) or len(c['expect']) <= 8 else c['expect'][:8] + [f'… ({len(c["expect"])})']
        mark = {True: 'ĐẠT ', False: 'SAI ', None: '--  '}[ok]
        print(f'{mark} {c["id"]} {c["q"]}\n      đáp án: {exp}' + (f'  ({c["note"]})' if c['note'] else '') + (f'\n      {why}' if why else ''))
        if verbose or ok is False:
            print('      trả lời:', (str(resp.get('answer') or '').replace('\n', ' ')[:300]), f'| ý định {resp.get("intent")} bởi {resp.get("routedBy")}')
        if ok is not None:
            scored += 1
            passed += ok
    times.sort()
    p95 = times[min(len(times) - 1, int(len(times) * 0.95))] if times else 0
    print(f'-> {passed}/{scored} ca đạt | {len(cases) - scored} ca thiếu dữ liệu không tính | thời gian trung vị {times[len(times) // 2]:.1f}s, p95 {p95:.1f}s')
    return 0 if passed == scored else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--mode', choices=['offline', 'live'], default='offline')
    ap.add_argument('--file', type=Path, default=DEFAULT_FILE)
    ap.add_argument('--cycle', default=DEFAULT_CYCLE)
    ap.add_argument('--today', type=date.fromisoformat, default=DEFAULT_TODAY)
    ap.add_argument('--verbose', action='store_true')
    ap.add_argument('ids', nargs='*', help='chỉ chạy các ca này (vd C05 C20)')
    a = ap.parse_args(argv)
    return run(a.mode, a.file, a.cycle, a.today, a.verbose, a.ids)


if __name__ == '__main__':
    sys.exit(main())

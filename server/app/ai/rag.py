"""Truy xuất đoạn liên quan trong bảng báo cáo (RAG) cho Trợ lý hỏi đáp.

Dữ liệu là chính bảng giao diện gửi lên (tối đa 300 dòng), nên không cần cơ sở dữ liệu vector:
  1. Cắt mỗi ô chữ (tên, mục tiêu, KPI, báo cáo tuần, vấn đề/rủi ro, comment...) thành đoạn ngắn, gắn mã dự án.
  2. Xếp hạng theo từ khoá (BM25, bỏ dấu, có cụm hai từ như "thực nghiệm") — luôn chạy, không gọi V-LLM.
  3. Nếu đặt AI_EMBED_MODEL: thêm xếp hạng theo embeddings của V-LLM rồi trộn hai bảng xếp hạng (RRF). Embeddings lỗi thì
     tự rơi về từ khoá, không làm hỏng câu trả lời.
Chỉ truy xuất. Việc viết câu trả lời và kiểm tra mã dự án / con số nằm ở agent/qa.py.
"""
from __future__ import annotations

import hashlib
import math
import re
import sqlite3
import threading
import time
import unicodedata
from array import array
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:  # có numpy thì so khớp cả bảng bằng một phép nhân ma trận; không có vẫn chạy (chậm hơn)
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

from .llm import VllmError, client
from .settings import settings

# khoá trong dòng bảng → nhãn hiển thị cho người dùng
TEXT_FIELDS = {
    'name': 'Tên dự án', 'goal': 'Mục tiêu', 'kpi': 'KPI', 'milestone': 'Milestone', 'note': 'Ghi chú',
    'done': 'Công việc đã hoàn thành trong tuần', 'plan': 'Kế hoạch tuần sau', 'issue': 'Vấn đề, rủi ro và đề xuất',
    'prev': 'Báo cáo các tuần trước', 'comment': 'Comment',
}
MAX_FIELD_CHARS = 1200   # mỗi ô chữ
CHUNK = 450              # độ dài tối đa một đoạn
TOP_K = 8                # số đoạn trả về
PER_CODE = 3             # tối đa số đoạn của cùng một dự án
EMBED_MAX = 4000         # bảng có quá nhiều đoạn thì bỏ embeddings (chỉ từ khoá); mỗi đoạn chỉ nạp một lần rồi lưu bộ nhớ nên các lần hỏi sau không tốn
EMBED_BATCH = 64
EMBED_WORKERS = 4        # số lô gọi V-LLM song song khi phải nạp nhiều đoạn mới
DISK_MAX = 60000         # số vector tối đa lưu trên đĩa; quá thì bỏ các vector cũ nhất
SEM_TOP = 50
W_LEX, W_LEX_SURE, W_SEM, W_EXTRA = 0.6, 1.3, 1.0, 0.6   # trọng số khi trộn: từ khoá (yếu khi chỉ trùng vài từ lẻ, chắc khi câu hỏi khớp đúng chữ), embeddings, cách diễn đạt khác do AI viết lại
PROJ_BOOST = 0.3         # dự án có nhiều đoạn cùng liên quan được cộng thêm điểm
RRF_K = 60
LEX_KEEP = 0.4   # đoạn từ khoá chỉ giữ khi điểm ≥ 40% điểm đoạn đứng đầu (bỏ đoạn chỉ khớp một từ phổ biến)
SEM_KEEP = 0.7   # đoạn embeddings chỉ giữ khi độ giống ≥ 70% đoạn đứng đầu và ≥ SEM_MIN
SEM_MIN = 0.2
RERANK_POOL = 20  # số đoạn đứng đầu sau khi trộn được đưa vào bước rerank (một lần gọi cho cả nhóm)
RERANK_MIN = 0.005  # sàn điểm rerank (V-LLM v1-rerank-medium): đo thật liên quan 0.018–0.37, nhiễu ≤0.002, chủ đề không có trong bảng ≈0.001. 0 = tắt
SEM_Z = 0.0      # sàn thống kê theo độ lệch chuẩn. TẮT: đo thật ragZ câu không có trong bảng (4.5–6.0) ngang câu có (3.4–7.4) nên không phân biệt được; dùng RERANK_MIN thay

# từ nối và từ hỏi (đã bỏ dấu). "du", "an" nằm trong đây vì câu nào cũng nói "dự án".
STOP = set('la va cua co khong nhu the nao gi nay do cac nhung mot trong voi duoc de da dang se o thi ma hay hoac bi tu den ve '
           'ra vao nhieu it du an cai sao bao hoi minh toi ban oi a nhe vay roi con'.split())


def norm(s: str) -> str:
    s = unicodedata.normalize('NFD', (s or '').lower().replace('đ', 'd'))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def content_tokens(text: str) -> list[str]:
    """Các từ có nghĩa của câu hỏi hoặc đoạn, đã bỏ dấu và bỏ từ nối."""
    return [t for t in re.findall(r'[a-z0-9]+', norm(text)) if t not in STOP]


def _terms(text: str) -> list[str]:
    toks = content_tokens(text)
    return toks + [f'{a}_{b}' for a, b in zip(toks, toks[1:])]  # thêm cụm hai từ để "thực nghiệm" khớp đúng cụm


def _chunks(text: str) -> list[str]:
    text = re.sub(r'[ \t]+', ' ', (text or '').strip())[:MAX_FIELD_CHARS]
    if len(text) <= CHUNK:
        return [text] if text else []
    out, cur = [], ''
    for part in re.split(r'(?<=[.!?;])\s+|\n+', text):
        if cur and len(cur) + len(part) + 1 > CHUNK:
            out.append(cur)
            cur = ''
        while len(part) > CHUNK:  # câu quá dài không có dấu ngắt
            out.append(part[:CHUNK])
            part = part[CHUNK:]
        cur = (cur + ' ' + part).strip()
    if cur:
        out.append(cur)
    return out


def build_passages(rows: list[dict]) -> list[dict]:
    """Mỗi đoạn: {code, name, field, label, text}. Dòng không có chữ ở ô nào thì không có đoạn."""
    out = []
    for r in rows:
        for key, label in TEXT_FIELDS.items():
            for ch in _chunks(str(r.get(key) or '')):
                out.append({'code': r['code'], 'name': r.get('name') or '', 'field': key, 'label': label, 'text': ch})
    return out


# ---------- từ khoá (BM25) ----------
def lexical(question: str, passages: list[dict]) -> list[tuple[int, float, set]]:
    """[(vị trí đoạn, điểm, các từ khoá khớp)] giảm dần theo điểm; chỉ gồm đoạn khớp ít nhất một từ."""
    q = set(_terms(question))
    if not q or not passages:
        return []
    docs = [Counter(_terms(f"{p['name']} {p['text']}" if p['field'] != 'name' else p['text'])) for p in passages]
    n = len(docs)
    avg = sum(sum(d.values()) for d in docs) / n or 1.0
    df = Counter(t for d in docs for t in q if t in d)
    out = []
    for i, d in enumerate(docs):
        ln = sum(d.values()) or 1
        score, hit = 0.0, set()
        for t in q:
            f = d.get(t)
            if not f:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            w = 1.5 if '_' in t else 1.0  # cụm hai từ khớp thì đáng tin hơn từ lẻ
            score += w * idf * f * 2.5 / (f + 1.5 * (0.25 + 0.75 * ln / avg))
            hit.add(t)
        if hit:
            if passages[i]['field'] == 'name':
                score *= 1.3  # hỏi theo tên dự án thì ưu tiên đoạn tên
            out.append((i, score, hit))
    out.sort(key=lambda x: -x[1])
    return out


def confident(question: str, passages: list[dict], ranked: list | None = None) -> bool:
    """Câu hỏi có nói đúng nội dung có trong bảng không (để quyết định có đi nhánh tìm kiếm mà không cần hỏi AI)."""
    toks = set(content_tokens(question))
    if not toks:
        return False
    ranked = lexical(question, passages) if ranked is None else ranked
    if not ranked:
        return False
    i, _, hit = ranked[0]
    matched = {t for t in hit if '_' not in t}
    if len(toks) == 1:
        return bool(matched) and passages[i]['field'] == 'name'
    return len(matched) >= 2 and len(matched) / len(toks) >= 0.6


# ---------- embeddings ----------
# Ba tầng nhớ: bộ nhớ tiến trình → đĩa (SQLite, sống qua lần khởi động lại server) → gọi V-LLM.
# Khoá = sha1(model + chữ đã che tên); đĩa chỉ lưu khoá băm và vector, KHÔNG lưu chữ gốc. Chữ thay đổi hoặc đổi model thì tự ra khoá mới,
# nên sửa vài dòng trong bảng chỉ phải nạp lại đúng các đoạn đó.
_CACHE: dict[str, array] = {}   # khoá → vector đã chuẩn hoá độ dài 1 (float32)
_CACHE_MAX = 20000
_LOCK = threading.Lock()
_FILL = threading.Lock()   # một lúc chỉ một luồng đi nạp vector mới: câu hỏi đến giữa lúc đang nạp sẵn thì chờ rồi dùng luôn kết quả, không gọi V-LLM lần hai


DOWN_FOR = 600           # giây: tài khoản không được dùng model embeddings (401/403/404) thì nghỉ thử lại, không làm chậm từng câu hỏi
_down: dict = {'until': 0.0, 'why': ''}


def embeddings_enabled() -> bool:
    ext = getattr(settings, 'embed_base_url', '')
    return bool(settings.rag_embeddings and settings.embed_model and settings.mode == 'vllm' and (not ext or settings.embed_api_key) and time.time() >= _down['until'])


_rr_down: dict = {'until': 0.0, 'why': ''}


def rerank_enabled() -> bool:
    return bool(settings.rag_rerank and settings.rerank_model and settings.mode == 'vllm' and getattr(settings, 'provider', 'vllm') == 'vllm' and time.time() >= _rr_down['until'])


def rerank_problem() -> str:
    return _rr_down['why'] if time.time() < _rr_down['until'] else ''


def embeddings_problem() -> str:
    """Lý do embeddings đang tạm nghỉ ('' nếu không)."""
    return _down['why'] if time.time() < _down['until'] else ''


def _note_failure(e: Exception) -> None:
    if getattr(e, 'status', None) in (401, 403, 404):   # lỗi quyền / sai tên model: gọi lại cũng vậy
        _down.update({'until': time.time() + DOWN_FOR, 'why': str(e)})


def _key(model: str, text: str) -> str:
    return hashlib.sha1(f"{getattr(settings, 'provider', '')}|{getattr(settings, 'embed_base_url', '')}|{model}\0{text}".encode('utf-8')).hexdigest()   # nhà cung cấp khác thì vector khác, không dùng chung


def _unit(v: list[float]) -> array:
    n = math.sqrt(sum(x * x for x in v))
    return array('f', [x / n for x in v] if n else v)


def _disk():
    """Kết nối SQLite của bộ nhớ đệm trên đĩa, hoặc None nếu tắt (AI_EMBED_CACHE trống/off) hoặc không ghi được."""
    path = getattr(settings, 'embed_cache', '')
    if not path:
        return None
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(str(p), timeout=5)
        con.execute('CREATE TABLE IF NOT EXISTS emb (k TEXT PRIMARY KEY, v BLOB NOT NULL, t REAL NOT NULL)')
        return con
    except (sqlite3.Error, OSError):
        return None


def _disk_load(keys: list[str]) -> dict[str, array]:
    con = _disk()
    if con is None or not keys:
        return {}
    out: dict[str, array] = {}
    try:
        with con:
            for k in range(0, len(keys), 500):
                part = keys[k:k + 500]
                for key, blob in con.execute(f"SELECT k, v FROM emb WHERE k IN ({','.join('?' * len(part))})", part):
                    a = array('f')
                    a.frombytes(blob)
                    out[key] = a
    except (sqlite3.Error, ValueError):
        out = {}
    finally:
        con.close()
    return out


def _disk_save(items: dict[str, array]) -> None:
    con = _disk()
    if con is None or not items:
        return
    try:
        now = time.time()
        with con:
            con.executemany('INSERT OR REPLACE INTO emb (k, v, t) VALUES (?, ?, ?)', [(k, v.tobytes(), now) for k, v in items.items()])
            extra = con.execute('SELECT COUNT(*) FROM emb').fetchone()[0] - DISK_MAX
            if extra > 0:
                con.execute('DELETE FROM emb WHERE k IN (SELECT k FROM emb ORDER BY t LIMIT ?)', (extra + DISK_MAX // 10,))
    except sqlite3.Error:
        pass
    finally:
        con.close()


def _remember(items: dict[str, array]) -> None:
    with _LOCK:
        if len(_CACHE) + len(items) > _CACHE_MAX:
            for k in list(_CACHE)[:max(len(items), _CACHE_MAX // 10)]:  # bỏ các vector nạp sớm nhất, không xoá sạch
                _CACHE.pop(k, None)
        _CACHE.update(items)


def _fill(need: list[str], keys: dict, have: dict, model: str) -> None:
    parts = [need[k:k + EMBED_BATCH] for k in range(0, len(need), EMBED_BATCH)]
    first_error: Exception | None = None
    workers = max(1, min(EMBED_WORKERS, getattr(settings, 'concurrency', 3), len(parts)))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(client.embed, part, model): part for part in parts}
        for fut in as_completed(futs):
            part = futs[fut]
            try:
                vecs = fut.result()
            except Exception as e:  # noqa: BLE001  — lưu các lô đã xong rồi mới báo lỗi
                first_error = first_error or e
                continue
            got = {keys[t]: _unit(v) for t, v in zip(part, vecs)}
            _remember(got)
            _disk_save(got)
            have.update({t: _unit(v) for t, v in zip(part, vecs)})
    if first_error is not None:
        raise first_error


def _embed_cached(texts: list[str], stats: dict | None = None) -> list[array]:
    """Vector (độ dài 1) của từng chuỗi. Chuỗi đã có trong bộ nhớ hoặc trên đĩa thì không gọi V-LLM; phần còn lại gọi theo lô, song song.
    Lô nào xong thì được lưu ngay, nên nếu một lô lỗi thì lần hỏi sau chỉ phải nạp tiếp phần còn thiếu."""
    t0 = time.time()
    model = settings.embed_model
    keys = {t: _key(model, t) for t in dict.fromkeys(texts)}
    with _LOCK:
        have = {t: _CACHE[k] for t, k in keys.items() if k in _CACHE}
    n_mem = len(have)
    miss = [t for t in keys if t not in have]
    if miss:
        from_disk = _disk_load([keys[t] for t in miss])
        for t in miss:
            if keys[t] in from_disk:
                have[t] = from_disk[keys[t]]
        _remember({k: v for k, v in from_disk.items()})
    need = [t for t in keys if t not in have]
    n_disk = len(have) - n_mem
    n_new = len(need)
    if need:
        with _FILL:
            with _LOCK:
                for t in need:
                    if keys[t] in _CACHE:   # luồng khác vừa nạp xong
                        have[t] = _CACHE[keys[t]]
            late = [t for t in need if t in have]
            n_mem += len(late)
            need = [t for t in need if t not in have]
            n_new = len(need)
            if need:
                _fill(need, keys, have, model)
    if stats is not None:
        stats.update({'memory': n_mem, 'disk': n_disk, 'new': n_new, 'ms': int((time.time() - t0) * 1000)})
    return [have[t] for t in texts]


def _embed_text(p: dict) -> str:
    """Chữ đem đi tạo embeddings: gắn mã và tên dự án vào mọi đoạn, để hỏi bằng tên dự án (không nói mã) vẫn tìm ra đúng đoạn thuộc dự án đó."""
    return p['text'] if p['field'] == 'name' else f"{p['code']} {p['name']} · {p['label']}: {p['text']}"


def semantic_many(queries: list[str], texts: list[str], stats: dict | None = None) -> list[list[tuple[int, float]]]:
    """Với mỗi câu hỏi: [(vị trí đoạn, độ giống)] giảm dần, tối đa SEM_TOP đoạn. Câu hỏi và `texts` đã được che tên người trước khi gửi đi.
    `stats['sem']` nhận [{mean, std}] của độ giống với CẢ BẢNG cho từng câu hỏi (để đặt sàn theo độ lệch chuẩn, không đoán số cố định)."""
    vecs = _embed_cached(queries + texts, stats)
    k = len(queries)
    qs, docs = vecs[:k], vecs[k:]
    spread: list[dict] = []
    if np is not None and docs:
        sims = np.asarray(qs, dtype=np.float32) @ np.asarray(docs, dtype=np.float32).T
        out = []
        for row in sims:
            spread.append({'mean': float(row.mean()), 'std': float(row.std())})
            order = np.argsort(-row, kind='stable')[:SEM_TOP]
            out.append([(int(i), float(row[i])) for i in order])
    else:
        out = []
        for q in qs:  # vector đã độ dài 1: tích vô hướng = cosine
            r = [(i, sum(x * y for x, y in zip(q, d))) for i, d in enumerate(docs)]
            vals = [v for _, v in r]
            mean = sum(vals) / len(vals) if vals else 0.0
            spread.append({'mean': mean, 'std': math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals)) if vals else 0.0})
            r.sort(key=lambda x: -x[1])
            out.append(r[:SEM_TOP])
    if stats is not None:
        stats['sem'] = spread
    return out


def semantic(question: str, texts: list[str], question_text: str | None = None, stats: dict | None = None) -> list[tuple[int, float]]:
    return semantic_many([question_text or question], texts, stats)[0]


def warm(rows: list[dict], mask=lambda s: s) -> dict:
    """Nạp sẵn vector của mọi đoạn trong bảng (gọi khi người dùng mở Trợ lý), để câu hỏi đầu tiên không phải chờ."""
    if not embeddings_enabled():
        return {'enabled': False, 'passages': 0}
    passages = build_passages(rows)
    if not passages or len(passages) > EMBED_MAX:
        return {'enabled': True, 'passages': len(passages), 'skipped': bool(passages)}
    stats: dict = {}
    try:
        _embed_cached([mask(_embed_text(p)) for p in passages], stats)
    except VllmError as e:
        _note_failure(e)
        raise
    return {'enabled': True, 'passages': len(passages), **stats}


# ---------- tìm ----------
def _keep_lex(ranked: list) -> list[int]:
    return [i for i, sc, _ in ranked[:30] if sc >= LEX_KEEP * ranked[0][1]] if ranked else []


def search(question: str, rows: list[dict], mask=lambda s: s, timing: dict | None = None, extra: list[str] | None = None) -> dict:
    """Trả {'passages': [đoạn], 'how': 'tu_khoa' | 'tu_khoa+embedding', 'confident': bool}.
    Trộn nhiều bảng xếp hạng bằng RRF có trọng số: từ khoá và embeddings cho CÂU HỎI GỐC (trọng số đầy đủ), cộng với các cách diễn đạt khác
    mà V-LLM viết lại từ câu hỏi (`extra`, trọng số thấp hơn) — nhờ đó câu hỏi nói một đằng, báo cáo viết một nẻo vẫn tìm ra.
    `mask`: hàm che tên người; dùng cho chữ gửi đi tạo embeddings."""
    passages = build_passages(rows)
    qn = norm(question)
    extras = [q for q in dict.fromkeys(str(x).strip() for x in (extra or [])) if q and norm(q) != qn][:3]
    lex = lexical(question, passages)
    conf = confident(question, passages, lex)
    lists: list[tuple[str, float, list[int]]] = []   # (nguồn, trọng số, vị trí đoạn theo thứ tự)
    # Từ khoá của câu gốc và của các câu viết lại thường lặp lại cùng vài chữ, nên gộp thành MỘT bảng (lấy điểm cao nhất của mỗi đoạn)
    # thay vì để cùng một chữ lẻ (vd "nghẽn") được tính nhiều lần và đè lên bằng chứng theo nghĩa.
    best: dict[int, float] = {i: sc for i, sc, _ in lex}
    for q in extras:
        for i, sc, _ in lexical(q, passages):
            best[i] = max(best.get(i, 0.0), sc)
    if best:
        top = max(best.values())
        merged = sorted(((i, sc) for i, sc in best.items() if sc >= LEX_KEEP * top), key=lambda x: -x[1])[:30]
        lists.append(('tu_khoa', W_LEX_SURE if conf else W_LEX, [i for i, _ in merged]))
    sims: dict[int, float] = {}
    how = 'tu_khoa'
    if embeddings_enabled() and passages:
        if len(passages) > EMBED_MAX:
            if timing is not None:
                timing['ragNote'] = f'bảng có {len(passages)} đoạn (> {EMBED_MAX}), chỉ tìm theo từ khoá'
        else:
            try:
                est: dict = {}
                res = semantic_many([mask(question), *[mask(q) for q in extras]], [mask(_embed_text(p)) for p in passages], est)
                spread = est.pop('sem', [])
                zs = []
                for k, sem in enumerate(res):
                    for i, sc in sem:
                        sims[i] = max(sims.get(i, -1.0), sc)
                    if sem:
                        mean, std = (spread[k]['mean'], spread[k]['std']) if k < len(spread) else (0.0, 0.0)
                        zs.append(round((sem[0][1] - mean) / std, 2) if std > 1e-9 else 0.0)
                        floor = max(SEM_MIN, SEM_KEEP * sem[0][1], mean + SEM_Z * std if SEM_Z > 0 else 0.0)
                        keep = [i for i, sc in sem[:30] if sc >= floor]
                        if keep:
                            lists.append(('embedding' if k == 0 else f'embedding_{k}', W_SEM if k == 0 else W_EXTRA, keep))
                how = 'tu_khoa+embedding'
                if timing is not None:
                    timing['ragEmbed'] = est  # {memory, disk, new, ms}: bao nhiêu đoạn lấy từ đâu, và mất bao lâu
                    timing['ragZ'] = zs        # độ lệch chuẩn của đoạn giống nhất so với cả bảng, theo từng câu (gốc, viết lại…)
            except (VllmError, ValueError, KeyError, TypeError) as e:
                _note_failure(e)
                if timing is not None:
                    timing['ragNote'] = f'embeddings lỗi, dùng từ khoá: {e}'
    fused: Counter = Counter()
    where: dict[int, dict[str, int]] = {}
    for name, w, rk in lists:
        for pos, i in enumerate(rk):
            fused[i] += w / (RRF_K + pos + 1)
            where.setdefault(i, {})[name] = pos + 1
    if not conf and not any(n.startswith('embedding') for n, _, _ in lists):  # khớp từ khoá yếu (vd chỉ trùng "làm", "giao hàng") và không đoạn nào đủ giống theo nghĩa: chủ đề này không có trong bảng
        return {'passages': [], 'how': how, 'confident': False}
    by_code: dict[str, list[float]] = {}
    for i, sc in fused.items():
        by_code.setdefault(passages[i]['code'], []).append(sc)
    final: dict[int, float] = {}
    for i, sc in fused.items():
        others = sorted(by_code[passages[i]['code']], reverse=True)
        others.remove(sc)   # bỏ chính nó; điểm cao nhất còn lại của cùng dự án là "bằng chứng thêm"
        final[i] = sc + PROJ_BOOST * (others[0] if others else 0.0)
    order = [i for i, _ in sorted(final.items(), key=lambda kv: (-kv[1], kv[0]))]
    rr: dict[int, float] = {}
    if len(order) > 1 and rerank_enabled():   # chấm lại độ liên quan của nhóm đứng đầu bằng model rerank; lỗi thì giữ thứ tự đã trộn
        pool = order[:RERANK_POOL]
        t0 = time.time()
        try:
            for k, sc in client.rerank(mask(question), [mask(_embed_text(passages[i]))[:900] for i in pool]):
                rr[pool[k]] = sc
            order = sorted(pool, key=lambda i: (-rr.get(i, -1e9), -final[i], i))
            if RERANK_MIN > 0:
                order = [i for i in order if rr.get(i, 0.0) >= RERANK_MIN]
            if timing is not None:
                timing['ragRerank'] = {'ms': int((time.time() - t0) * 1000), 'so_doan': len(pool), 'diem_cao_nhat': round(max(rr.values()), 3) if rr else None}
        except (VllmError, ValueError, KeyError, TypeError) as e:
            rr = {}
            if getattr(e, 'status', None) in (401, 403, 404):
                _rr_down.update({'until': time.time() + DOWN_FOR, 'why': str(e)})
            if timing is not None:
                timing['ragNote'] = f'rerank lỗi, giữ thứ tự đã trộn: {e}'
    picked, per = [], Counter()
    for i in order:
        c = passages[i]['code']
        if per[c] >= PER_CODE:
            continue
        per[c] += 1
        picked.append(i)
        if len(picked) >= TOP_K:
            break
    if timing is not None:
        timing['ragTrace'] = [{'code': passages[i]['code'], 'truong': passages[i]['label'], 'diem': round(final[i], 4), 'hang': where.get(i, {}), **({'cos': round(sims[i], 3)} if i in sims else {}), **({'rr': round(rr[i], 3)} if i in rr else {})} for i in picked]
        if sims:
            timing['ragTop'] = {'cos_cao_nhat': round(max(sims.values()), 3), 'chắc_từ_khoá': conf}
    return {'passages': [passages[i] for i in picked], 'how': how, 'confident': conf}

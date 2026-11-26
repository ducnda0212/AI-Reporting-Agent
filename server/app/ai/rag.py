"""Truy xuất đoạn liên quan trong bảng báo cáo (RAG) cho Trợ lý hỏi đáp.

Dữ liệu là chính bảng giao diện gửi lên (tối đa 300 dòng), nên không cần cơ sở dữ liệu vector:
  1. Cắt mỗi ô chữ (tên, mục tiêu, KPI, báo cáo tuần, vấn đề/rủi ro, comment...) thành đoạn ngắn, gắn mã dự án.
  2. Xếp hạng theo từ khoá (BM25, bỏ dấu, có cụm hai từ như "thực nghiệm") — luôn chạy, không gọi V-LLM.
  3. Nếu đặt AI_EMBED_MODEL: thêm xếp hạng theo embeddings của V-LLM rồi trộn hai bảng xếp hạng (RRF). Embeddings lỗi thì
     tự rơi về từ khoá, không làm hỏng câu trả lời.
Chỉ truy xuất. Việc viết câu trả lời và kiểm tra mã dự án / con số nằm ở agent/qa.py.
"""
from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter

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
EMBED_MAX = 800          # bảng có quá nhiều đoạn thì bỏ embeddings (chỉ từ khoá) để khỏi chậm
EMBED_BATCH = 64
RRF_K = 60
LEX_KEEP = 0.4   # đoạn từ khoá chỉ giữ khi điểm ≥ 40% điểm đoạn đứng đầu (bỏ đoạn chỉ khớp một từ phổ biến)
SEM_KEEP = 0.7   # đoạn embeddings chỉ giữ khi độ giống ≥ 70% đoạn đứng đầu và ≥ SEM_MIN
SEM_MIN = 0.2

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
_CACHE: dict[tuple[str, str], list[float]] = {}
_CACHE_MAX = 6000


def embeddings_enabled() -> bool:
    return bool(settings.rag_embeddings and settings.embed_model and settings.mode == 'vllm')


def _embed_cached(texts: list[str]) -> list[list[float]]:
    """Vector của từng chuỗi; chuỗi đã tính rồi (cùng model) lấy từ bộ nhớ, nên hỏi lại trên cùng bảng không gọi V-LLM nữa."""
    model = settings.embed_model
    if len(_CACHE) > _CACHE_MAX:
        _CACHE.clear()  # đơn giản: đầy thì bỏ hết, lần hỏi sau nạp lại
    need = [t for t in dict.fromkeys(texts) if (model, t) not in _CACHE]
    for k in range(0, len(need), EMBED_BATCH):
        part = need[k:k + EMBED_BATCH]
        for t, v in zip(part, client.embed(part, model)):
            _CACHE[(model, t)] = v
    return [_CACHE[(model, t)] for t in texts]


def _cos(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def semantic(question: str, texts: list[str], question_text: str | None = None) -> list[tuple[int, float]]:
    """[(vị trí, độ giống)] giảm dần. `texts` và câu hỏi đã được che tên người trước khi gửi đi."""
    vecs = _embed_cached([question_text or question] + texts)
    q, docs = vecs[0], vecs[1:]
    out = [(i, _cos(q, d)) for i, d in enumerate(docs)]
    out.sort(key=lambda x: -x[1])
    return out


# ---------- tìm ----------
def search(question: str, rows: list[dict], mask=lambda s: s, timing: dict | None = None) -> dict:
    """Trả {'passages': [đoạn đã che tên], 'how': 'tu_khoa' | 'tu_khoa+embedding', 'confident': bool}.
    `mask`: hàm che tên người; dùng cho chữ gửi đi tạo embeddings."""
    passages = build_passages(rows)
    lex = lexical(question, passages)
    conf = confident(question, passages, lex)
    ranks: list[list[int]] = [[i for i, sc, _ in lex[:30] if sc >= LEX_KEEP * lex[0][1]]]
    how = 'tu_khoa'
    if embeddings_enabled() and passages:
        if len(passages) > EMBED_MAX:
            if timing is not None:
                timing['ragNote'] = f'bảng có {len(passages)} đoạn (> {EMBED_MAX}), chỉ tìm theo từ khoá'
        else:
            try:
                sem = semantic(question, [mask(p['text']) for p in passages], mask(question))
                ranks.append([i for i, sc in sem[:30] if sc >= max(SEM_MIN, SEM_KEEP * sem[0][1])])
                how = 'tu_khoa+embedding'
            except (VllmError, ValueError, KeyError, TypeError) as e:
                if timing is not None:
                    timing['ragNote'] = f'embeddings lỗi, dùng từ khoá: {e}'
    fused: Counter = Counter()
    for rk in ranks:
        for pos, i in enumerate(rk):
            fused[i] += 1 / (RRF_K + pos + 1)
    if how == 'tu_khoa' and not conf:  # chỉ từ khoá và khớp yếu (vd chỉ trùng "làm", "giao hàng"): chủ đề này không có trong bảng
        return {'passages': [], 'how': how, 'confident': False}
    picked, per = [], Counter()
    for i, _ in sorted(fused.items(), key=lambda kv: (-kv[1], kv[0])):
        c = passages[i]['code']
        if per[c] >= PER_CODE:
            continue
        per[c] += 1
        picked.append(passages[i])
        if len(picked) >= TOP_K:
            break
    return {'passages': picked, 'how': how, 'confident': conf}

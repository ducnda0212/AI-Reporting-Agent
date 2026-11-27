"""Đọc cấu hình từ server/.env (và biến môi trường)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # chạy được cả khi chưa cài python-dotenv
    load_dotenv = None

SERVER_DIR = Path(__file__).resolve().parents[2]  # server/
if load_dotenv and os.getenv('PMO_SKIP_DOTENV') != '1':
    load_dotenv(SERVER_DIR / '.env')


def _b(name: str, default: str = '0') -> bool:
    return os.getenv(name, default).strip().lower() in ('1', 'true', 'yes', 'on')


@dataclass
class Settings:
    mode: str
    base_url: str
    model: str
    agent_model: str
    api_key: str
    auth_url: str
    client_id: str
    client_secret: str
    project_id: str
    thinking: bool
    guardrail: str
    json_mode: str
    max_tokens: int
    timeout: float
    ca_bundle: str
    insecure: bool
    concurrency: int
    mask_names: bool
    port: int
    embed_model: str = ''        # tên model embeddings của V-LLM; trống = RAG chỉ tìm theo từ khoá
    rag_embeddings: bool = True  # tắt hẳn embeddings dù đã đặt model
    rerank_model: str = ''       # model xếp hạng lại (V-LLM /rerank): sau khi tìm xong, chấm lại độ liên quan của từng đoạn với câu hỏi; trống = tắt
    rag_rerank: bool = True      # tắt hẳn rerank dù đã đặt model
    agent_mode: str = 'router'   # 'router' = V-LLM chọn một loại truy vấn có sẵn; 'tools' = V-LLM tự gọi công cụ, đọc kết quả, thử lại (AI_AGENT_MODE)
    provider: str = 'vllm'       # 'vllm' | 'openai': AI_PROVIDER chọn bộ cấu hình nào được dùng (VLLM_* hay OPENAI_*)
    embed_base_url: str = ''     # dịch vụ embeddings RIÊNG, vd https://api.openai.com/v1 (chỉ dùng với dữ liệu mẫu/giả); trống = dùng V-LLM
    embed_api_key: str = ''      # khoá của dịch vụ embeddings riêng, chỉ để trong server/.env
    embed_cache: str = ''        # file SQLite lưu vector embeddings để khởi động lại không phải nạp lại; trống = chỉ nhớ trong bộ nhớ
    asr_model: str = 'v-llm-v1-asr'  # model nhận dạng giọng nói (/v1/audio/transcriptions)
    asr_base_url: str = ''           # dịch vụ nhận dạng giọng nói RIÊNG (vd Blaze: https://api.blaze.vn/v1); trống = dùng V-LLM
    asr_api_key: str = ''            # khoá của dịch vụ giọng nói riêng, chỉ để trong server/.env

    @property
    def auth_kind(self) -> str:
        if self.api_key:
            return 'api_key'
        if self.auth_url and self.client_id and self.client_secret:
            return 'oauth'
        return 'none'

    def problems(self) -> list[str]:
        """Những chỗ còn thiếu khiến không gọi được V-LLM."""
        if self.mode != 'vllm':
            return []
        if self.provider == 'openai':
            return [] if self.api_key else ['Chưa đặt OPENAI_API_KEY']
        out = []
        if not self.base_url:
            out.append('Chưa đặt VLLM_BASE_URL')
        elif not self.base_url.rstrip('/').endswith('/v1'):
            out.append('VLLM_BASE_URL nên kết thúc bằng /v1')
        if self.auth_kind == 'none':
            out.append('Chưa có VLLM_API_KEY hoặc bộ VLLM_AUTH_URL + VLLM_CLIENT_ID + VLLM_CLIENT_SECRET')
        return out


def _cache_path(v: str) -> str:
    v = v.strip()
    if v.lower() in ('', '0', 'off', 'no', 'none', 'false'):
        return ''
    p = Path(v)
    return str(p if p.is_absolute() else SERVER_DIR / p)


def load(env: dict | None = None) -> Settings:
    """Đọc cấu hình từ biến môi trường, hoặc từ một dict (dùng khi kiểm thử)."""
    src = os.environ if env is None else env

    def g(name: str, default: str = '') -> str:
        v = src.get(name)
        return default if v is None else str(v)

    def b(name: str, default: str = '0') -> bool:
        return g(name, default).strip().lower() in ('1', 'true', 'yes', 'on')

    mode = g('AI_MODE', 'mock').strip().lower()
    provider = g('AI_PROVIDER', 'openai' if mode == 'openai' else 'vllm').strip().lower()
    provider = 'openai' if provider == 'openai' else 'vllm'
    oa = provider == 'openai'   # AI_PROVIDER=openai: chat và embeddings đều đi OpenAI bằng OPENAI_*; vllm: dùng VLLM_* như cũ
    return Settings(
        mode='vllm' if mode in ('vllm', 'openai') else 'mock',
        provider=provider,
        base_url=(g('OPENAI_BASE_URL', 'https://api.openai.com/v1') if oa else g('VLLM_BASE_URL', '')).strip().rstrip('/'),
        model=(g('OPENAI_MODEL', 'gpt-4o-mini') if oa else g('VLLM_MODEL', 'v-llm-v1-large')).strip(),
        # model riêng cho Agent hỏi đáp (việc diễn đạt ngắn, cần nhanh); trống = dùng model chính
        agent_model=((g('OPENAI_AGENT_MODEL', '').strip() or g('OPENAI_MODEL', 'gpt-4o-mini').strip()) if oa
                     else (g('AGENT_MODEL', '').strip() or g('VLLM_MODEL', 'v-llm-v1-large').strip())),
        api_key=(g('OPENAI_API_KEY', '') if oa else g('VLLM_API_KEY', '')).strip(),
        auth_url='' if oa else g('VLLM_AUTH_URL', '').strip(),
        client_id='' if oa else g('VLLM_CLIENT_ID', '').strip(),
        client_secret='' if oa else g('VLLM_CLIENT_SECRET', '').strip(),
        project_id='' if oa else g('VLLM_PROJECT_ID', '').strip(),
        thinking=False if oa else b('VLLM_THINKING', '0'),
        guardrail='' if oa else g('VLLM_GUARDRAIL', '').strip().lower(),
        json_mode=g('VLLM_JSON_MODE', 'schema').strip().lower(),
        max_tokens=int(g('VLLM_MAX_TOKENS', '2048')),
        timeout=float(g('VLLM_TIMEOUT', '90')),
        ca_bundle=g('VLLM_CA_BUNDLE', '').strip(),
        insecure=b('VLLM_INSECURE', '0'),
        concurrency=max(1, int(g('AI_CONCURRENCY', '3'))),
        mask_names=b('AI_MASK_NAMES', '1'),
        port=int(g('PORT', '8000')),
        embed_model=(g('OPENAI_EMBED_MODEL', 'text-embedding-3-small') if oa else g('AI_EMBED_MODEL', '')).strip(),
        rag_embeddings=b('AI_RAG_EMBEDDINGS', '1'),
        rerank_model=(g('AI_RERANK_MODEL', '') if oa else g('AI_RERANK_MODEL', 'v-llm-v1-rerank-medium')).strip(),   # openai: chỉ bật khi tự đặt AI_RERANK_MODEL (endpoint {base}/rerank)
        rag_rerank=b('AI_RAG_RERANK', '1'),
        agent_mode='tools' if g('AI_AGENT_MODE', 'router').strip().lower() == 'tools' else 'router',
        embed_base_url='' if oa else g('AI_EMBED_BASE_URL', '').strip().rstrip('/'),   # openai: embeddings đi cùng base và key với chat
        embed_api_key='' if oa else g('AI_EMBED_API_KEY', '').strip(),
        embed_cache=_cache_path(g('AI_EMBED_CACHE', 'storage/embed_cache.db')),
        asr_base_url=g('AI_ASR_BASE_URL', '').strip().rstrip('/'),
        asr_api_key=g('AI_ASR_API_KEY', '').strip(),
        asr_model=g('AI_ASR_MODEL', '').strip() or ('blaze-stt-1.5' if 'blaze' in g('AI_ASR_BASE_URL', '').lower() else 'v-llm-v1-asr'),
    )


settings = load()

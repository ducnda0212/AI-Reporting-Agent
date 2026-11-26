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
        out = []
        if not self.base_url:
            out.append('Chưa đặt VLLM_BASE_URL')
        elif not self.base_url.rstrip('/').endswith('/v1'):
            out.append('VLLM_BASE_URL nên kết thúc bằng /v1')
        if self.auth_kind == 'none':
            out.append('Chưa có VLLM_API_KEY hoặc bộ VLLM_AUTH_URL + VLLM_CLIENT_ID + VLLM_CLIENT_SECRET')
        return out


def load(env: dict | None = None) -> Settings:
    """Đọc cấu hình từ biến môi trường, hoặc từ một dict (dùng khi kiểm thử)."""
    src = os.environ if env is None else env

    def g(name: str, default: str = '') -> str:
        v = src.get(name)
        return default if v is None else str(v)

    def b(name: str, default: str = '0') -> bool:
        return g(name, default).strip().lower() in ('1', 'true', 'yes', 'on')

    mode = g('AI_MODE', 'mock').strip().lower()
    return Settings(
        mode='vllm' if mode == 'vllm' else 'mock',
        base_url=g('VLLM_BASE_URL', '').strip().rstrip('/'),
        model=g('VLLM_MODEL', 'v-llm-v1-large').strip(),
        # model riêng cho Agent hỏi đáp (việc diễn đạt ngắn, cần nhanh); trống = dùng VLLM_MODEL
        agent_model=(g('AGENT_MODEL', '').strip() or g('VLLM_MODEL', 'v-llm-v1-large').strip()),
        api_key=g('VLLM_API_KEY', '').strip(),
        auth_url=g('VLLM_AUTH_URL', '').strip(),
        client_id=g('VLLM_CLIENT_ID', '').strip(),
        client_secret=g('VLLM_CLIENT_SECRET', '').strip(),
        project_id=g('VLLM_PROJECT_ID', '').strip(),
        thinking=b('VLLM_THINKING', '0'),
        guardrail=g('VLLM_GUARDRAIL', '').strip().lower(),
        json_mode=g('VLLM_JSON_MODE', 'schema').strip().lower(),
        max_tokens=int(g('VLLM_MAX_TOKENS', '2048')),
        timeout=float(g('VLLM_TIMEOUT', '90')),
        ca_bundle=g('VLLM_CA_BUNDLE', '').strip(),
        insecure=b('VLLM_INSECURE', '0'),
        concurrency=max(1, int(g('AI_CONCURRENCY', '3'))),
        mask_names=b('AI_MASK_NAMES', '1'),
        port=int(g('PORT', '8000')),
        embed_model=g('AI_EMBED_MODEL', '').strip(),
        rag_embeddings=b('AI_RAG_EMBEDDINGS', '1'),
    )


settings = load()

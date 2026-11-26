"""Cấu hình chung cho kiểm thử, chạy TRƯỚC khi import bất kỳ module app nào.

1. Backend (DB/upload): dùng thư mục tạm, không đụng dữ liệu thật.
2. Phần AI: KHÔNG đọc server/.env thật (tránh gọi nhầm V-LLM thật), trỏ tới V-LLM giả chạy trên máy.
"""
import os
import sys
import tempfile
import threading
import time
import urllib.request

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))  # gốc repo: import server.app...
sys.path.insert(0, HERE)                                    # import fake_vllm

# --- 1. backend: DB + uploads cách ly
_TMP = tempfile.mkdtemp(prefix="pmo_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOADS_DIR"] = os.path.join(_TMP, "uploads")
os.environ["DEFAULT_CYCLE_ID"] = "2026_11_w3"  # pinned: tests assume week 3; auto mode is tested via monkeypatch

# --- 2. AI: V-LLM giả, bỏ qua .env thật
FAKE_PORT, API_PORT = 9555, 8799
TEST_ENV = {
    'PMO_SKIP_DOTENV': '1',
    'AI_MODE': 'vllm', 'VLLM_BASE_URL': f'http://127.0.0.1:{FAKE_PORT}/tenant/v1', 'VLLM_MODEL': 'v-llm-v1-large',
    'VLLM_API_KEY': '', 'VLLM_AUTH_URL': f'http://127.0.0.1:{FAKE_PORT}/oauth/token', 'VLLM_CLIENT_ID': 'cid',
    'VLLM_CLIENT_SECRET': 'secret', 'VLLM_PROJECT_ID': 'p1', 'VLLM_THINKING': '0', 'VLLM_GUARDRAIL': 'low',
    'VLLM_JSON_MODE': 'schema', 'VLLM_CA_BUNDLE': '', 'VLLM_INSECURE': '0', 'VLLM_TIMEOUT': '10',
    'AI_MASK_NAMES': '1', 'AI_CONCURRENCY': '3',
}
os.environ.update(TEST_ENV)


@pytest.fixture(scope='session')
def fake():
    import fake_vllm
    srv = fake_vllm.start(FAKE_PORT)
    yield fake_vllm.STATE
    srv.shutdown()


@pytest.fixture(autouse=True)
def reset_fake_state():
    import fake_vllm
    fake_vllm.STATE.update({'reject_schema': False, 'status_queue': [], 'reply': None, 'agent_text': None, 'agent_codes': None})
    yield


@pytest.fixture(scope='session')
def api(fake):
    """Chạy các route AI thật (uvicorn, không cần DB) trỏ tới V-LLM giả; trả hàm gọi HTTP."""
    import json
    import uvicorn
    from server.app.ai.api import app
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=API_PORT, log_level='warning'))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(80):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{API_PORT}/api/health', timeout=1)
            break
        except Exception:
            time.sleep(0.1)

    def call(path, body=None, raw=None, ctype='application/json', method=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(f'http://127.0.0.1:{API_PORT}{path}', data=data, method=method or ('POST' if data is not None else 'GET'))
        if data is not None:
            req.add_header('Content-Type', ctype)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())
    yield call
    server.should_exit = True

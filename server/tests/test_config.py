from app.ai.settings import load


def test_defaults_are_mock_without_env():
    s = load({})
    assert s.mode == 'mock' and s.model == 'v-llm-v1-large' and s.mask_names and not s.thinking
    assert s.problems() == []


def test_auth_kind():
    assert load({'VLLM_API_KEY': 'k'}).auth_kind == 'api_key'
    assert load({'VLLM_AUTH_URL': 'u', 'VLLM_CLIENT_ID': 'i', 'VLLM_CLIENT_SECRET': 's'}).auth_kind == 'oauth'
    assert load({'VLLM_AUTH_URL': 'u', 'VLLM_CLIENT_ID': 'i'}).auth_kind == 'none'
    # API key được ưu tiên khi điền cả hai
    assert load({'VLLM_API_KEY': 'k', 'VLLM_AUTH_URL': 'u', 'VLLM_CLIENT_ID': 'i', 'VLLM_CLIENT_SECRET': 's'}).auth_kind == 'api_key'


def test_problems_when_vllm_misconfigured():
    p = load({'AI_MODE': 'vllm'}).problems()
    assert any('VLLM_BASE_URL' in x for x in p) and any('VLLM_API_KEY' in x for x in p)
    p = load({'AI_MODE': 'vllm', 'VLLM_BASE_URL': 'https://h/t', 'VLLM_API_KEY': 'k'}).problems()
    assert p == ['VLLM_BASE_URL nên kết thúc bằng /v1']
    assert load({'AI_MODE': 'VLLM', 'VLLM_BASE_URL': 'https://h/t/v1/', 'VLLM_API_KEY': 'k'}).problems() == []


def test_parsing_and_trailing_slash():
    s = load({'VLLM_BASE_URL': ' https://h/t/v1/ ', 'VLLM_THINKING': 'true', 'AI_CONCURRENCY': '0', 'AI_MASK_NAMES': '0', 'VLLM_GUARDRAIL': 'LOW'})
    assert s.base_url == 'https://h/t/v1' and s.thinking and s.concurrency == 1 and not s.mask_names and s.guardrail == 'low'

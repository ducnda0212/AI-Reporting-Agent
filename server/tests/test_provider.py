"""AI_PROVIDER: một công tắc chọn V-LLM hay OpenAI; cấu hình của bên còn lại không bị đụng tới."""
from server.app.ai import settings as st

BOTH = {
    'AI_MODE': 'vllm', 'VLLM_BASE_URL': 'https://v-llm.example/t/v1', 'VLLM_API_KEY': 'vk', 'VLLM_MODEL': 'v-llm-v1-medium', 'VLLM_GUARDRAIL': 'low',
    'VLLM_THINKING': '1', 'AGENT_MODEL': 'v-llm-v1-small', 'AI_EMBED_MODEL': 'v-llm-v1-embed-medium',
    'OPENAI_API_KEY': 'ok', 'OPENAI_MODEL': 'gpt-4o-mini', 'OPENAI_EMBED_MODEL': 'text-embedding-3-small',
}


def test_default_provider_is_vllm_and_ignores_openai_settings():
    s = st.load(dict(BOTH))
    assert (s.provider, s.base_url, s.api_key, s.model, s.agent_model, s.guardrail, s.thinking, s.embed_model) == (
        'vllm', 'https://v-llm.example/t/v1', 'vk', 'v-llm-v1-medium', 'v-llm-v1-small', 'low', True, 'v-llm-v1-embed-medium')
    assert s.problems() == []


def test_openai_provider_uses_openai_settings_only():
    s = st.load({**BOTH, 'AI_PROVIDER': 'openai'})
    assert (s.provider, s.base_url, s.api_key, s.model, s.agent_model, s.guardrail, s.thinking, s.embed_model) == (
        'openai', 'https://api.openai.com/v1', 'ok', 'gpt-4o-mini', 'gpt-4o-mini', '', False, 'text-embedding-3-small')
    assert s.mode == 'vllm' and s.auth_kind == 'api_key' and s.embed_base_url == '' and s.problems() == []


def test_openai_agent_model_can_differ():
    s = st.load({**BOTH, 'AI_PROVIDER': 'openai', 'OPENAI_AGENT_MODEL': 'gpt-4.1-nano', 'OPENAI_BASE_URL': 'https://proxy.example/v1/'})
    assert s.agent_model == 'gpt-4.1-nano' and s.model == 'gpt-4o-mini' and s.base_url == 'https://proxy.example/v1'


def test_openai_without_key_reports_the_problem():
    s = st.load({'AI_MODE': 'vllm', 'AI_PROVIDER': 'openai'})
    assert s.problems() == ['Chưa đặt OPENAI_API_KEY']


def test_ai_mode_openai_is_a_shortcut_and_mock_still_means_no_calls():
    assert st.load({**BOTH, 'AI_MODE': 'openai'}).provider == 'openai'
    m = st.load({**BOTH, 'AI_MODE': 'mock', 'AI_PROVIDER': 'openai'})
    assert m.mode == 'mock' and m.problems() == []


def test_unknown_provider_falls_back_to_vllm():
    assert st.load({**BOTH, 'AI_PROVIDER': 'abc'}).provider == 'vllm'


def test_client_treats_custom_openai_base_url_as_openai():
    from server.app.ai.llm import VllmClient
    assert VllmClient(st.load({**BOTH, 'AI_PROVIDER': 'openai', 'OPENAI_BASE_URL': 'https://proxy.example/v1'})).openai
    assert not VllmClient(st.load(dict(BOTH))).openai


def test_voice_is_independent_of_the_chat_provider():
    asr = {'AI_ASR_BASE_URL': 'https://asr.example/v1', 'AI_ASR_API_KEY': 'ak', 'AI_ASR_MODEL': 'whisper-large'}
    for prov in ('openai', 'vllm'):
        s = st.load({**BOTH, **asr, 'AI_PROVIDER': prov})
        assert (s.asr_base_url, s.asr_api_key, s.asr_model) == ('https://asr.example/v1', 'ak', 'whisper-large')
    assert st.load({**BOTH, 'AI_PROVIDER': 'openai'}).asr_model == 'v-llm-v1-asr'   # không tự đổi sang model của OpenAI

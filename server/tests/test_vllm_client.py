import pytest

from app.ai.settings import load
from app.ai.llm import VllmClient, VllmError


def make(fake_url, **over):
    env = {'AI_MODE': 'vllm', 'VLLM_BASE_URL': fake_url + '/tenant/v1', 'VLLM_API_KEY': 'tok-static', 'VLLM_TIMEOUT': '5'}
    env.update(over)
    c = VllmClient(load(env))
    c.backoff = 0
    return c


URL = 'http://127.0.0.1:9555'


def test_body_has_thinking_guardrail_and_schema():
    c = make(URL, VLLM_GUARDRAIL='large', VLLM_THINKING='1')
    b = c._body([{'role': 'user', 'content': 'x'}], {'title': 'draft', 'type': 'object'}, None, 0.2)
    assert b['chat_template_kwargs'] == {'enable_thinking': True} and b['guardrail'] == 'large'
    assert b['response_format']['type'] == 'json_schema' and b['response_format']['json_schema']['name'] == 'draft'
    assert b['max_tokens'] == 2048 and b['model'] == 'v-llm-v1-large'


def test_body_without_guardrail_or_schema():
    b = make(URL)._body([], None, 100, 0)
    assert 'guardrail' not in b and 'response_format' not in b and b['max_tokens'] == 100
    assert make(URL, VLLM_JSON_MODE='none')._body([], {'title': 'x'}, None, 0).get('response_format') is None
    assert make(URL, VLLM_JSON_MODE='object')._body([], {'title': 'x'}, None, 0)['response_format'] == {'type': 'json_object'}


def test_static_api_key_chat(fake):
    res = make(URL).chat([{'role': 'user', 'content': 'Trả lời đúng một từ: OK'}])
    assert res['content'] == 'OK' and res['finish'] == 'stop'


def test_retries_on_429_and_503(fake):
    fake['status_queue'] = [429, 503]
    assert make(URL).chat([{'role': 'user', 'content': 'hi'}])['content'] == 'OK'


def test_gives_up_after_three_server_errors(fake):
    fake['status_queue'] = [500, 500, 500]
    with pytest.raises(VllmError) as e:
        make(URL).chat([{'role': 'user', 'content': 'hi'}])
    assert e.value.status == 500


@pytest.mark.parametrize('code,word', [(404, 'đường dẫn'), (403, 'quyền'), (400, 'từ chối')])
def test_client_errors_are_not_retried_and_explained(fake, code, word):
    fake['status_queue'] = [code]
    calls = fake['calls']
    with pytest.raises(VllmError) as e:
        make(URL).chat([{'role': 'user', 'content': 'hi'}])
    assert word in str(e.value) and fake['calls'] == calls + 1


def test_bad_token_reports_401(fake):
    with pytest.raises(VllmError) as e:
        make(URL, VLLM_API_KEY='wrong').chat([{'role': 'user', 'content': 'hi'}])
    assert e.value.status == 401


def test_oauth_bad_secret(fake):
    c = make(URL, VLLM_API_KEY='', VLLM_AUTH_URL=URL + '/oauth/token', VLLM_CLIENT_ID='c', VLLM_CLIENT_SECRET='sai')
    with pytest.raises(VllmError) as e:
        c.chat([{'role': 'user', 'content': 'hi'}])
    assert 'token' in str(e.value).lower()


def test_oauth_token_is_cached(fake):
    c = make(URL, VLLM_API_KEY='', VLLM_AUTH_URL=URL + '/oauth/token', VLLM_CLIENT_ID='c', VLLM_CLIENT_SECRET='secret')
    fake['reject_first_token'] = False
    before = fake['tokens']
    c.chat([{'role': 'user', 'content': 'a'}])
    c.chat([{'role': 'user', 'content': 'b'}])
    assert fake['tokens'] == before + 1


def test_unreachable_host_message():
    c = make('http://127.0.0.1:9')
    with pytest.raises(VllmError) as e:
        c.chat([{'role': 'user', 'content': 'hi'}])
    assert 'Không kết nối được' in str(e.value)


def test_chat_json_reasks_once_when_reply_is_not_json(fake):
    fake['reply'] = 'xin lỗi tôi không biết'
    with pytest.raises(VllmError) as e:
        make(URL).chat_json([{'role': 'user', 'content': 'x'}], {'title': 't', 'type': 'object'})
    assert 'JSON' in str(e.value)
    assert fake['bodies'][-1]['messages'][-1]['content'].startswith('Câu trả lời trên không phải JSON')


def test_models(fake):
    assert 'v-llm-v1-medium' in make(URL).models()

"""Đọc lại mã dự án người dùng nói thành tiếng."""
import pytest

from server.app.ai.speech import normalize_codes as n


@pytest.mark.parametrize('said,want', [
    ('cho i chấm a chấm một chấm một rủi ro cao', 'cho I.A.1.1 rủi ro cao'),
    ('ii chấm a chấm một chấm hai và i chấm c chấm một chấm hai', 'II.A.1.2 và I.C.1.2'),
    ('đổi tiến độ của i.a.1.1 thành chậm', 'đổi tiến độ của I.A.1.1 thành chậm'),
    ('i chấm 1 chấm 6 chấm 5 là dự án gì', 'I.1.6.5 là dự án gì'),
    ('hai chấm ba chấm bốn', 'hai chấm ba chấm bốn'),   # toàn số: không phải mã
    ('giá 1.5 triệu', 'giá 1.5 triệu'),
    ('không có mã nào ở đây', 'không có mã nào ở đây'),
])
def test_spoken_codes(said, want):
    assert n(said) == want


def test_external_asr_uses_own_base_url_key_and_model(monkeypatch):
    """Dịch vụ giọng nói riêng (Blaze): gọi đúng địa chỉ, khoá riêng, không gửi response_format, đọc được text."""
    import io
    import urllib.request

    from server.app.ai.llm import VllmClient
    from server.app.ai.settings import load

    cfg = load({'AI_MODE': 'vllm', 'VLLM_BASE_URL': 'https://vllm.example/v1', 'VLLM_API_KEY': 'vk', 'AI_ASR_BASE_URL': 'https://api.blaze.vn/v1/', 'AI_ASR_API_KEY': 'bk'})
    assert cfg.asr_base_url == 'https://api.blaze.vn/v1' and cfg.asr_model == 'blaze-stt-1.5'
    seen = {}

    class Res(io.BytesIO):
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake(req, timeout=None, context=None):
        seen['url'], seen['auth'], seen['body'] = req.full_url, req.get_header('Authorization'), req.data
        return Res(b'{"text": "Xin ch\\u00e0o", "status": "completed"}')
    monkeypatch.setattr(urllib.request, 'urlopen', fake)
    out = VllmClient(cfg).transcribe(b'RIFFxxxx', language='vi')
    assert out['text'] == 'Xin chào'
    assert seen['url'] == 'https://api.blaze.vn/v1/audio/transcriptions' and seen['auth'] == 'Bearer bk'
    assert b'blaze-stt-1.5' in seen['body'] and b'response_format' not in seen['body']


def test_asr_defaults_to_vllm_when_no_external_url():
    from server.app.ai.settings import load
    cfg = load({'AI_MODE': 'vllm'})
    assert cfg.asr_base_url == '' and cfg.asr_model == 'v-llm-v1-asr'

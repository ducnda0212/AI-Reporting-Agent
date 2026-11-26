"""Ô Vấn đề/rủi ro/đề xuất của tuần + gợi ý AC: lấy từ dữ liệu trước, AI chỉ khi thiếu."""
import pytest

from app.ai import drafts
from app.ai.settings import settings
from app.ai.llm import VllmError

WEEK = {'key': 'w3', 'start': '2026-11-15', 'end': '2026-11-22'}
REPORT = {'date': '2026-11-18', 'done': 'Hoàn thiện API', 'plan': 'Chạy UAT'}
RN_FULL = '||Date||Mô tả issue/risk||Todo||PIC||\n|{{2026-11-17}}|Thiếu GPU|Mượn GPU team B|Tech Lead|\n'
RN_HALF = RN_FULL + '|{{2026-11-18}}|Đối tác chậm trả API| | |\n'


@pytest.fixture
def mock_mode(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'mock')


@pytest.fixture
def no_ai(monkeypatch):
    """Bảo đảm không gọi AI: gọi là hỏng test."""
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(drafts.client, 'chat_json', lambda *a, **k: pytest.fail('không được gọi AI'))


def test_enough_data_does_not_call_ai(no_ai):
    out = drafts.draft_row({'week': WEEK, 'riskNotes': RN_FULL, 'weekReport': REPORT})
    iss = out['issues']
    assert iss['need'] == 'none' and iss['suggestion'] is None and iss['from'] == 'Risk Notes'
    assert iss['text'] == 'Rủi ro: Thiếu GPU\n→ Đề xuất: Mượn GPU team B (Tech Lead)'
    assert out['riskLevel'] == {'text': 'Trung bình', 'why': 'Có 1 rủi ro ghi trong Risk Notes', 'by': 'rule'}


def test_quiet_week_and_no_report_do_not_call_ai(no_ai):
    assert drafts.draft_row({'week': WEEK, 'weekReport': REPORT})['issues']['text'] == 'Không có vấn đề phát sinh trong tuần.'
    out = drafts.draft_row({'week': WEEK})
    assert out['issues']['text'].startswith('Chưa có Progress Report tuần này') and out['riskLevel']['by'] == 'rule'


def test_mock_action_mode_suggests_only_missing_action(mock_mode):
    out = drafts.draft_row({'week': WEEK, 'riskNotes': RN_HALF, 'weekReport': REPORT})
    iss = out['issues']
    assert iss['need'] == 'action' and 'Đối tác chậm trả API' in iss['text']
    sug = iss['suggestion']
    assert sug['kind'] == 'action' and sug['count'] == 1 and sug['by'] == 'mock'
    assert sug['text'].startswith('Đối tác chậm trả API\n→ Đề xuất: Nhắc bằng email')   # hướng xử lý thường dùng của C7
    assert sug['merged'] == ('Rủi ro: Thiếu GPU\n→ Đề xuất: Mượn GPU team B (Tech Lead)\n'
                             'Rủi ro: Đối tác chậm trả API\n→ Đề xuất: Nhắc bằng email, bổ sung ETA; theo dõi hằng tuần')
    assert 'Rủi ro:' not in sug['text'].split('\n')[0]


def test_mock_full_mode_detects_from_signal(mock_mode):
    out = drafts.draft_row({'week': WEEK, 'late': True, 'weekReport': {'done': '- Xong API\n- Đang chờ GPU từ hạ tầng', 'plan': ''}})
    iss = out['issues']
    assert iss['need'] == 'full' and iss['text'] == ''
    assert iss['suggestion']['text'].startswith('Rủi ro: Đang chờ GPU từ hạ tầng\n→ Đề xuất: ')
    assert out['riskLevel']['text'] == 'Cao'


def test_vllm_masks_names_and_formats_optional_owner(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    seen = {}

    def fake(msgs, schema, max_tokens=None, **kw):
        seen['user'], seen['schema'] = msgs[-1]['content'], schema
        return {'model': 'v-llm-v1-large', 'data': {
            'items': [{'risk': 'Đối tác chậm trả API', 'action': 'Hẹn [Người 1] chốt ETA', 'owner': '', 'due': '', 'category': 'C7', 'why': 'chưa có Todo'}],
            'riskLevel': {'text': 'Trung bình', 'why': 'rủi ro chưa chặn việc'}}}
    monkeypatch.setattr(drafts.client, 'chat_json', fake)
    out = drafts.draft_row({'week': WEEK, 'riskNotes': RN_HALF.replace('Đối tác chậm', 'Phạm Quốc Huy báo đối tác chậm'),
                            'weekReport': REPORT, 'people': ['Phạm Quốc Huy']})
    assert 'Phạm Quốc Huy' not in seen['user'] and seen['schema']['title'] == 'week_suggestion'
    assert '"kieu": "goi_y_de_xuat"' in seen['user']
    sug = out['issues']['suggestion']
    assert sug['text'].endswith('→ Đề xuất: Hẹn Phạm Quốc Huy chốt ETA') and sug['by'] == 'v-llm-v1-large'   # owner/hạn trống → không ghi ngoặc
    assert out['riskLevel'] == {'text': 'Trung bình', 'why': 'rủi ro chưa chặn việc', 'by': 'v-llm-v1-large'}


def test_vllm_full_mode_empty_items_means_no_issue(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(drafts.client, 'chat_json', lambda *a, **k: {'data': {'items': [], 'riskLevel': {'text': 'Thấp', 'why': 'ổn'}}})
    out = drafts.draft_row({'week': WEEK, 'weekReport': {'done': 'Đã xử lý xong lỗi tuần trước', 'plan': ''}})
    assert out['issues']['suggestion'] is None and out['issues']['text'] == 'Không có vấn đề phát sinh trong tuần.'
    assert out['riskLevel']['text'] == 'Thấp'


def test_vllm_malformed_reply_keeps_data_and_rule_level(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(drafts.client, 'chat_json', lambda *a, **k: {'data': {'items': 'sai', 'riskLevel': {'text': 'Rất cao'}}})
    out = drafts.draft_row({'week': WEEK, 'riskNotes': RN_HALF, 'weekReport': REPORT})
    assert out['issues']['suggestion'] is None and 'Đối tác chậm trả API' in out['issues']['text']
    assert out['riskLevel']['by'] == 'rule'


def test_c9_left_out_of_reference():
    assert 'C9' not in drafts.REF_CATS and 'C9' not in drafts.SYSTEM.split('nhóm rủi ro:')[1].split('Hướng')[0]


def test_batch_counts_ai_calls_and_collects_errors(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'mock')
    res = drafts.draft_rows([{'id': 1, 'week': WEEK, 'weekReport': REPORT}, {'id': 2, 'week': WEEK, 'late': True, 'weekReport': REPORT}])
    assert set(res['drafts']) == {'1', '2'} and res['aiCalls'] == 1 and res['model'] == 'mock'

    def flaky(row):
        if row['id'] == 2:
            raise VllmError('V-LLM đang giới hạn số lần gọi (HTTP 429).')
        if row['id'] == 3:
            raise RuntimeError('hỏng')
        return {'issues': {'need': 'none'}, 'riskLevel': {}}
    monkeypatch.setattr(drafts, 'draft_row', flaky)
    res = drafts.draft_rows([{'id': 1}, {'id': 2}, {'id': 3}])
    assert set(res['drafts']) == {'1'} and '429' in res['errors']['2'] and 'hỏng' in res['errors']['3'] and res['aiCalls'] == 0


def test_strips_invented_threshold_and_escalation():
    row = {'week': WEEK, 'weekReport': {'done': 'Chờ GPU, hạn 20/11', 'plan': ''}}
    a = 'Đẩy nhanh phê duyệt cấp GPU; nếu trễ quá 3 ngày, báo cáo lãnh đạo TT để điều phối hạ tầng'
    assert drafts._strip_invented(a, row) == 'Đẩy nhanh phê duyệt cấp GPU'
    # số/cấp có trong dữ liệu thì giữ
    row2 = {'note': 'nếu trễ quá 3 ngày thì báo lãnh đạo'}
    assert drafts._strip_invented(a, row2) == a
    assert drafts._strip_invented('Chốt ETA GPU', row) == 'Chốt ETA GPU'

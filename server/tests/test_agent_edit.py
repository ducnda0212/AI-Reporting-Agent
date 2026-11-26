"""Agent đề xuất sửa ô: không bao giờ tự ghi; code kiểm tra cột, giá trị, dự án; AI chỉ đọc câu lệnh."""
import pytest

from server.app.ai.agent import edit as agent_edit, qa as agent
from server.app.ai.settings import settings

FIELDS = [
    {'id': 'td', 'name': 'Tiến độ', 'options': ['Đúng tiến độ', 'Có nguy cơ chậm', 'Chậm tiến độ']},
    {'id': 'rui', 'name': 'Mức độ rủi ro', 'options': ['Cao', 'Trung bình', 'Thấp']},
    {'id': 'mang', 'name': 'Nhóm', 'options': ['Food', 'Voice']},
    {'id': 'ghichu', 'name': 'Ghi chú'},
    {'id': 'tt', 'name': 'Trạng thái Jira', 'editable': False, 'lockedWhy': 'lấy thẳng từ Jira'},
]
ROWS = [
    {'code': 'DA01', 'values': {'td': 'Chậm tiến độ', 'rui': 'Cao', 'mang': 'Food', 'ghichu': '', 'tt': 'In Progress'}},
    {'code': 'DA02', 'values': {'td': 'Đúng tiến độ', 'rui': '', 'mang': 'Food', 'ghichu': 'ok', 'tt': 'In Progress'}},
    {'code': 'DA03', 'values': {'td': 'Chậm tiến độ', 'rui': 'Trung bình', 'mang': 'Voice', 'ghichu': '', 'tt': 'Done'}},
    {'code': 'DA04', 'values': {'td': 'Có nguy cơ chậm', 'rui': '', 'mang': 'Voice', 'ghichu': '', 'tt': 'Done'}},
]


def op(field, value, codes=(), wf='', wv='', only_empty=False, all_=False):
    return {'field': field, 'value': value, 'target': {'codes': list(codes), 'where_field': wf, 'where_value': wv, 'only_empty': only_empty, 'all': all_}}


@pytest.fixture
def no_ai(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(agent_edit.client, 'chat_json', lambda *a, **k: pytest.fail('không được gọi AI'))


def ai_returns(monkeypatch, plan):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    seen = {}

    def fake(msgs, schema, max_tokens=None, **k):
        seen['user'], seen['schema'], seen['model'] = msgs[-1]['content'], schema, k.get('model')
        return {'model': 'm', 'ms': 500, 'usage': {'completion_tokens': 40}, 'data': plan}
    monkeypatch.setattr(agent_edit.client, 'chat_json', fake)
    return seen


def test_simple_command_parsed_by_rule_without_ai(no_ai):
    out = agent_edit.propose('Đổi Tiến độ của DA01, DA02 thành chậm tiến độ', ROWS, FIELDS)
    assert out['by'] == 'rule' and out['applied'] is False
    assert out['proposals'] == [{'code': 'DA02', 'field': 'td', 'fieldName': 'Tiến độ', 'from': 'Đúng tiến độ', 'to': 'Chậm tiến độ'}]   # DA01 đã đúng → bỏ


def test_filter_and_only_empty_via_ai(monkeypatch):
    seen = ai_returns(monkeypatch, {'ops': [op('rui', 'trung binh', wf='mang', wv='food', only_empty=True)], 'unclear': ''})
    out = agent_edit.propose('Điền Mức độ rủi ro = Trung bình cho các dự án Food còn trống', ROWS, FIELDS)
    assert [(p['code'], p['from'], p['to']) for p in out['proposals']] == [('DA02', '', 'Trung bình')]
    assert out['by'] == 'm' and out['timing']['parseMs'] == 500 and seen['schema']['title'] == 'agent_edit'
    assert 'In Progress' not in seen['user'] and 'Chậm tiến độ' in seen['user']   # AI không thấy dữ liệu dòng, chỉ thấy danh sách giá trị cho phép


def test_locked_field_invalid_value_unknown_code_are_skipped(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('tt', 'Done', codes=['DA01']), op('td', 'Rất chậm', codes=['DA01']), op('rui', 'Thấp', codes=['DA09', 'DA03'])], 'unclear': ''})
    out = agent_edit.propose('Trạng thái DA01 là Done, tiến độ DA01 rất chậm, rủi ro DA09 và DA03 thấp', ROWS, FIELDS)
    reasons = ' | '.join(s['reason'] for s in out['skipped'])
    assert 'lấy thẳng từ Jira' in reasons and '"Rất chậm" không có trong danh sách chọn' in reasons and 'DA09' in reasons
    assert out['proposals'] == [{'code': 'DA03', 'field': 'rui', 'fieldName': 'Mức độ rủi ro', 'from': 'Trung bình', 'to': 'Thấp'}]


def test_no_scope_means_no_change(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('rui', 'Thấp')], 'unclear': ''})
    out = agent_edit.propose('Điền rủi ro thấp', ROWS, FIELDS)
    assert out['proposals'] == [] and 'cho dự án nào' in out['answer']


def test_unclear_command_asks_back(monkeypatch):
    ai_returns(monkeypatch, {'ops': [], 'unclear': 'Bạn muốn đổi cột nào?'})
    out = agent_edit.propose('sửa giúp cái kia', ROWS, FIELDS)
    assert out['proposals'] == [] and out['answer'].endswith('Bạn muốn đổi cột nào?')


def test_all_only_when_explicit_and_cell_limit(monkeypatch):
    rows = [{'code': f'P{i}', 'values': {'ghichu': ''}} for i in range(80)]
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'Chờ họp khối', all_=True)], 'unclear': ''})
    out = agent_edit.propose('Điền Ghi chú "Chờ họp khối" cho tất cả dự án', rows, FIELDS)
    assert len(out['proposals']) == agent_edit.MAX_CELLS and any('tối đa' in s['reason'] for s in out['skipped'])


def test_approval_is_never_done_by_agent(no_ai):
    out = agent_edit.propose('Duyệt hết nháp của DA01', ROWS, FIELDS)
    assert out['proposals'] == [] and 'người rà' in out['answer']
    # chữ "chốt" nằm trong giá trị cần điền thì vẫn là lệnh sửa
    assert agent_edit.propose('Đổi Ghi chú của DA01 thành Chờ chốt scope', ROWS, FIELDS)['proposals'][0]['to'] == 'Chờ chốt scope'


def test_names_masked_in_command(monkeypatch):
    seen = ai_returns(monkeypatch, {'ops': [op('ghichu', 'Hỏi [Người 1] về GPU', codes=['DA01'])], 'unclear': ''})
    out = agent_edit.propose('Ghi chú cho DA01: hỏi anh Nguyễn Văn An về GPU', ROWS, FIELDS, people=['Nguyễn Văn An'])
    assert 'Nguyễn Văn An' not in seen['user'] and out['proposals'][0]['to'] == 'Hỏi Nguyễn Văn An về GPU'


def test_ask_routes_edit_to_proposals(no_ai):
    rows = [{**r, 'progress': r['values']['td']} for r in ROWS]
    out = agent.ask('Đổi Mức độ rủi ro của DA04 thành Thấp', rows, FIELDS)
    assert out['intent'] == 'edit' and out['proposals'][0]['code'] == 'DA04' and out['applied'] is False


@pytest.mark.parametrize('bad_target', [dict(all_=True), dict(codes=['DA01', 'DA02', 'DA03', 'DA04'])])
def test_ai_widening_scope_is_corrected_from_the_command(monkeypatch, bad_target):
    """V-LLM thật từng trả "tất cả"/mọi mã cho câu "các dự án Voice": code thu hẹp lại theo điều kiện có trong câu."""
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'Chờ họp khối', **bad_target)], 'unclear': ''})
    out = agent_edit.propose('Ghi chú "Chờ họp khối" cho các dự án Voice', ROWS, FIELDS)
    assert sorted(p['code'] for p in out['proposals']) == ['DA03', 'DA04']


def test_widened_scope_without_any_condition_asks_back(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'Chờ họp khối', all_=True)], 'unclear': ''})
    out = agent_edit.propose('Ghi chú "Chờ họp khối" giúp mình', ROWS, FIELDS)
    assert out['proposals'] == [] and 'cho dự án nào' in out['answer']


def test_value_text_is_not_taken_as_condition(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'Food team xử lý', codes=['DA03'])], 'unclear': ''})
    out = agent_edit.propose('Ghi chú cho DA03: Food team xử lý', ROWS, FIELDS)
    assert [p['code'] for p in out['proposals']] == ['DA03']


def test_flat_ops_from_new_schema(monkeypatch):
    ai_returns(monkeypatch, {'ops': [{'field': 'rui', 'value': 'Cao', 'codes': ['DA02', 'DA04'], 'where_field': '', 'where_value': '',
                                      'only_empty': False, 'all': False}], 'unclear': ''})
    out = agent_edit.propose('Đánh dấu rủi ro cao cho DA02 và DA04', ROWS, FIELDS)
    assert sorted(p['code'] for p in out['proposals']) == ['DA02', 'DA04']


def test_truncated_reply_from_vllm_still_gives_preview_and_errors_do_not_crash(monkeypatch):
    from server.app.ai.llm import VllmError, parse_json
    monkeypatch.setattr(settings, 'mode', 'vllm')
    cut = '{"ops":[{"field":"rui","value":"Cao","codes":["DA02","DA04"]'
    monkeypatch.setattr(agent_edit.client, 'chat_json', lambda msgs, schema, max_tokens=None, **k: {'model': 'm', 'data': parse_json(cut, k.get('repair'))})
    out = agent_edit.propose('Đánh dấu rủi ro cao cho DA02 và DA04', ROWS, FIELDS)
    assert sorted(p['code'] for p in out['proposals']) == ['DA02', 'DA04']

    def boom(*a, **k):
        raise VllmError('V-LLM không trả về JSON hợp lệ.', 200, '')
    monkeypatch.setattr(agent_edit.client, 'chat_json', boom)
    out = agent_edit.propose('Đánh dấu rủi ro cao cho DA02 và DA04', ROWS, FIELDS)
    assert out['proposals'] == [] and 'nói lại' in out['answer'] and out['timing']['error']
    monkeypatch.setattr(agent.client, 'chat_json', boom)
    a = agent.ask('Dự án nào chậm?', [{'code': 'DA01', 'progress': 'Chậm tiến độ'}])
    assert a['answer'].startswith('Có 1/1 dự án') and not a['grounded']

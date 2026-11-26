"""Agent đề xuất sửa ô: không bao giờ tự ghi; code kiểm tra cột, giá trị, dự án; AI chỉ đọc câu lệnh."""
import pytest

from app.ai.agent import edit as agent_edit, qa as agent
from app.ai.settings import settings

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
    rows = [{'code': f'P{i}', 'values': {'ghichu': ''}} for i in range(agent_edit.MAX_CELLS + 20)]
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


def test_ask_routes_edit_to_proposals(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'vllm')

    def fake(msgs, schema, max_tokens=None, **k):
        if schema['title'] == 'agent_route':   # V-LLM đọc ý định: đây là lệnh sửa; việc dựng đề xuất do bước sau (luật + code kiểm tra)
            return {'model': 'm', 'data': {'query': 'edit', 'field': '', 'value': '', 'filters': [], 'group_by': '', 'sort': '', 'limit': 0, 'due': '', 'view_action': '', 'column': '', 'refers_previous': False}}
        pytest.fail('không được gọi AI')
    monkeypatch.setattr(agent_edit.client, 'chat_json', fake)
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
    from app.ai.llm import VllmError, parse_json
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


def test_edit_flag_skips_routing_and_lets_ai_read_free_wording(monkeypatch):
    """Giao diện báo đây là lệnh sửa (luật tại chỗ không hiểu): bỏ qua phân loại, AI đọc ý, code vẫn kiểm tra rồi mới đề xuất."""
    seen = ai_returns(monkeypatch, {'ops': [op('ghichu', 'Chờ họp', wf='td', wv='Chậm tiến độ')], 'unclear': ''})
    monkeypatch.setattr(agent, 'route', lambda *a, **k: pytest.fail('không được phân loại lại'))
    out = agent.ask('mấy dự án đang trễ thì note lại giúp mình là chờ họp', ROWS, FIELDS, None, True)
    assert out['intent'] == 'edit' and out['applied'] is False
    assert [(p['code'], p['field'], p['to']) for p in out['proposals']] == [('DA01', 'ghichu', 'Chờ họp'), ('DA03', 'ghichu', 'Chờ họp')]
    assert 'Chờ họp' in seen['user'] or 'trễ' in seen['user']


def test_edit_flag_still_refuses_locked_column_and_missing_fields(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('tt', 'Done', codes=['DA01'])], 'unclear': ''})
    out = agent.ask('chuyển DA01 sang xong giúp mình', ROWS, FIELDS, None, True)
    assert out['proposals'] == [] and 'Jira' in out['skipped'][0]['reason']
    # không có danh sách cột thì không ép sang nhánh sửa (đi đường phân loại như cũ)
    monkeypatch.setattr(agent, 'route', lambda *a, **k: ({'query': 'edit', 'field': '', 'value': ''}, 'rule'))
    assert 'danh sách cột' in agent.ask('đổi gì đó', ROWS, None, None, True)['answer']


def test_only_empty_alone_is_a_valid_scope(monkeypatch):
    """"dự án nào chưa có note thì ghi X": điều kiện ô trống đã đủ làm phạm vi, không cần nói "tất cả"."""
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'Chờ CBLD', only_empty=True)], 'unclear': ''})
    out = agent.ask('dự án nào chưa có note thì ghi chờ CBLD', ROWS, FIELDS, None, True)
    assert [p['code'] for p in out['proposals']] == ['DA01', 'DA03', 'DA04'] and all(p['to'] == 'Chờ CBLD' for p in out['proposals'])
    assert not out['skipped']


def test_empty_where_value_means_empty_cell(monkeypatch):
    """V-LLM thật từng ghi "chưa có note" thành where_field=ghichu, where_value="": hiểu là ô ghi chú trống."""
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'chờ CBLD', wf='ghichu', wv='')], 'unclear': ''})
    out = agent.ask('dự án nào chưa có note thì ghi chờ CBLD', ROWS, FIELDS, None, True)
    assert [p['code'] for p in out['proposals']] == ['DA01', 'DA03', 'DA04'] and not out['skipped']


def test_ai_returning_nothing_without_reason_asks_user_to_clarify(monkeypatch):
    ai_returns(monkeypatch, {'ops': [], 'unclear': ''})
    out = agent.ask('đổi tất cả dự án sang đúng tiến độ', ROWS, FIELDS, None, True)
    assert out['proposals'] == [] and 'nói rõ' in out['unclear'] and out['plan']['ops'] == []


@pytest.mark.parametrize('target', [dict(wf='td', wv='Chậm tiến độ'), dict(only_empty=True), dict(wf='rui', wv='')])
def test_command_without_any_project_scope_never_guesses_scope(monkeypatch, target):
    """"đổi mức rủi ro thành cao" không nói dự án nào: AI tự đoán phạm vi thì code bỏ đi, không đề xuất gì."""
    ai_returns(monkeypatch, {'ops': [op('rui', 'Cao', **target)], 'unclear': ''})
    out = agent.ask('đổi mức rủi ro thành cao', ROWS, FIELDS, None, True)
    assert out['proposals'] == [] and out['skipped']


def test_rule_match_with_trailing_words_is_reread_by_ai(monkeypatch):
    """"…thành đúng tiến độ dc ko": mẫu quen đọc cả đuôi câu thành giá trị sai; V-LLM đọc lại ý rồi mới kết luận."""
    seen = ai_returns(monkeypatch, {'ops': [op('td', 'Đúng tiến độ', codes=['DA01'])], 'unclear': ''})
    out = agent_edit.propose('Đổi Tiến độ của DA01 thành đúng tiến độ dc ko', ROWS, FIELDS)
    assert [(p['code'], p['to']) for p in out['proposals']] == [('DA01', 'Đúng tiến độ')] and out['by'] == 'm' and 'user' in seen


def test_already_equal_value_is_named_in_the_answer(no_ai):
    out = agent_edit.propose('Đổi Tiến độ của DA01 thành Chậm tiến độ', ROWS, FIELDS)
    assert not out['proposals'] and 'DA01' in out['answer'] and 'rồi' in out['answer']


def test_nothing_empty_in_scope_says_so(monkeypatch):
    rows = [{'code': f'P{i}', 'values': {'ghichu': 'đã có'}} for i in range(5)]
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'Chờ họp khối', only_empty=True)], 'unclear': ''})
    out = agent_edit.propose('Điền Ghi chú "Chờ họp khối" cho các dự án đang trống', rows, FIELDS)
    assert out['proposals'] == [] and 'cả 5 dự án' in out['answer'] and 'đã có nội dung' in out['answer']

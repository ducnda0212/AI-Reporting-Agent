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


@pytest.mark.parametrize('wf,wv', [('rui', 'Chưa có'), ('rui', 'chưa đánh giá'), ('rui', 'trống')])
def test_only_empty_with_empty_phrase_on_same_field_means_empty_cells(monkeypatch, wf, wv):
    """Live eval: "dự án nào chưa có rủi ro thì để trung bình" → AI ghi where_value="Chưa có" trên cột rui; phải hiểu là ô rui trống."""
    ai_returns(monkeypatch, {'ops': [op('rui', 'Trung bình', wf=wf, wv=wv, only_empty=True)], 'unclear': ''})
    out = agent.ask('dự án nào chưa có rủi ro thì để trung bình', ROWS, FIELDS, None, True)
    assert [(p['code'], p['to']) for p in out['proposals']] == [('DA02', 'Trung bình'), ('DA04', 'Trung bình')] and not out['skipped']


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


def test_follow_up_edit_may_reuse_codes_from_previous_turn(monkeypatch):
    hist = [{'q': 'mấy dự án trễ thì ghi note chờ họp', 'codes': ['DA01', 'DA03'], 'a': 'Mình đã soạn 2 thay đổi'}]
    seen = ai_returns(monkeypatch, {'ops': [op('rui', 'Cao', codes=['DA01', 'DA03'])], 'unclear': ''})
    out = agent_edit.propose('đặt rủi ro cao cho mấy dự án đó luôn', ROWS, FIELDS, history=hist)
    assert [p['code'] for p in out['proposals']] == ['DA03']  # DA01 đã Cao
    assert 'cau_truoc' in seen['user'] and 'DA01' in seen['user']  # AI được đưa các câu trước


def test_previous_codes_are_not_allowed_without_a_reference_word(monkeypatch):
    hist = [{'q': 'x', 'codes': ['DA04'], 'a': ''}]
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'chờ', codes=['DA04'])], 'unclear': ''})
    out = agent_edit.propose('ghi chú chờ', ROWS, FIELDS, history=hist)
    assert not out['proposals']  # câu không nhắc dự án nào: AI không được tự lấy mã cũ


# ---------- cột AI chọn để lọc đang trống: tìm cột khác có đúng giá trị đó ----------
F2 = [{'id': 'td', 'name': 'Tiến độ', 'options': ['Đúng tiến độ', 'Có nguy cơ chậm', 'Chậm tiến độ']},
      {'id': 'mang', 'name': 'Mảng việc'},
      {'id': 'domain', 'name': 'Domain', 'options': ['Food', 'Ride', 'Express']}]
R2 = [{'code': 'A1', 'values': {'td': 'Đúng tiến độ', 'mang': 'I.A.4.Tối ưu Food & Express', 'domain': ''}},
      {'code': 'A2', 'values': {'td': 'Đúng tiến độ', 'mang': 'I.A.4.Tối ưu Food & Express', 'domain': ''}},
      {'code': 'B1', 'values': {'td': 'Đúng tiến độ', 'mang': 'I.C.1.Điều phối Ride', 'domain': ''}}]


def test_empty_domain_column_falls_back_to_group_column(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('td', 'Chậm tiến độ', wf='domain', wv='Food')], 'unclear': ''})
    out = agent_edit.propose('đổi dự án food & express sang chậm tiến độ nhé', R2, F2)
    assert {p['code'] for p in out['proposals']} == {'A1', 'A2'} and not out['skipped']


def test_ambiguous_fallback_is_not_guessed_and_message_is_clear(monkeypatch):
    rows = [*R2, {'code': 'C1', 'values': {'td': 'Đúng tiến độ', 'mang': 'II.F.1.An toàn Food Safety', 'domain': ''}}]
    ai_returns(monkeypatch, {'ops': [op('td', 'Chậm tiến độ', wf='domain', wv='Food')], 'unclear': ''})
    out = agent_edit.propose('đổi dự án food sang chậm tiến độ nhé', rows, F2)
    assert out['proposals'] == [] and 'đang trống' in out['skipped'][0]['reason'] and 'Giá trị hiện có: .' not in out['skipped'][0]['reason']


def test_group_name_given_as_condition_on_wrong_nonempty_column(monkeypatch):
    f = [{'id': 'note', 'name': 'Note'}, {'id': 'loai', 'name': 'Loại dự án'}, {'id': 'mang', 'name': 'Mảng việc'}]
    g = 'I.A.6. An toàn & Cá nhân hóa thống nhất & nâng cao'
    rows = [{'code': 'I.A.6.1', 'values': {'note': '', 'loai': 'KHHĐ 2026', 'mang': g}}, {'code': 'I.A.6.2', 'values': {'note': '', 'loai': 'KHHĐ 2026', 'mang': g}},
            {'code': 'I.A.3.1', 'values': {'note': '', 'loai': 'KHHĐ 2026', 'mang': 'I.A.3.PAI - Cá nhân hóa trải nghiệm cho từng khách'}}]
    ai_returns(monkeypatch, {'ops': [op('note', 'chờ CBLĐ', wf='loai', wv='An toàn & cá nhân hóa')], 'unclear': ''})
    out = agent_edit.propose('đổi note của các dự án thuộc An toàn & cá nhân hóa sang chờ CBLĐ', rows, f)
    assert [p['code'] for p in out['proposals']] == ['I.A.6.1', 'I.A.6.2'] and not out['skipped']


def test_condition_split_by_comma_matches_group_with_ampersand(monkeypatch):
    rows = [{**r, 'values': {**r['values'], 'domain': 'Food' if r['code'] == 'B1' else ''}} for r in R2]  # Domain có giá trị, nhưng không khớp "Food, Express"
    ai_returns(monkeypatch, {'ops': [op('td', 'Chậm tiến độ', wf='domain', wv='Food, Express')], 'unclear': ''})
    out = agent_edit.propose('đổi dự án food & express sang chậm tiến độ nhé', rows, F2)
    assert {p['code'] for p in out['proposals']} == {'A1', 'A2'} and not out['skipped']


# ---------- gọi dự án bằng TÊN, không nêu mã ----------
NAMED = [dict(r, name=n) for r, n in zip(ROWS, ['Nhận diện và xác thực khuôn mặt', 'Trợ lý giọng nói', 'Điều phối tài xế', 'Chấm điểm tín dụng'])]
FN = FIELDS + [{'id': 'lc', 'name': 'AI Lifecycle', 'options': ['Bước 1', 'Bước 5', 'Bước 8', 'Bước 10']}]
for _r in NAMED:
    _r['values']['lc'] = 'Bước 8'


def test_project_named_without_code_is_resolved_by_ai_and_names_are_sent(monkeypatch):
    seen = ai_returns(monkeypatch, {'ops': [op('lc', 'Bước 1', codes=['DA01'])], 'unclear': ''})
    out = agent_edit.propose('Đổi bước AI lifecycle trong dự án nhận diện và xác thực khuôn mặt, từ bước 8 thành bước 1', NAMED, FN)
    assert [(p['code'], p['to']) for p in out['proposals']] == [('DA01', 'Bước 1')]
    assert 'Nhận diện và xác thực khuôn mặt' in seen['user']  # V-LLM được đưa tên dự án


def test_name_said_loosely_still_matches_but_unrelated_code_added_by_ai_is_dropped(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('lc', 'Bước 1', codes=['DA01', 'DA03'])], 'unclear': ''})
    out = agent_edit.propose('chuyển ai lifecycle dự án nhan dien xac thuc khuon mat sang bước 1', NAMED, FN)
    assert [p['code'] for p in out['proposals']] == ['DA01']  # DA03 không được nhắc bằng mã hay tên


def test_missing_code_suggests_code_with_same_numbers(monkeypatch):
    rows = [{'code': 'I.A.2.6.1', 'name': 'x', 'values': {'lc': 'Bước 5'}}]
    ai_returns(monkeypatch, {'ops': [op('lc', 'Bước 10', codes=['I.2.6.1'])], 'unclear': ''})
    out = agent_edit.propose('đổi cột AI lifecycle của dự án I.2.6.1 từ bước 5 thành bước 10', rows, FN)
    assert [p['code'] for p in out['proposals']] == ['I.A.2.6.1']   # một mã cùng dãy số: đoán nhưng nói rõ để người dùng xác nhận
    assert 'Mình đoán bạn muốn I.A.2.6.1' in out['answer'] and out['guessed'] == [{'from': 'I.2.6.1', 'to': 'I.A.2.6.1'}]


def test_two_similar_codes_are_not_guessed_but_listed(monkeypatch):
    rows = [{'code': 'I.A.2.6.1', 'values': {'lc': 'Bước 5'}}, {'code': 'I.B.2.6.1', 'values': {'lc': 'Bước 5'}}]
    ai_returns(monkeypatch, {'ops': [op('lc', 'Bước 10', codes=['I.2.6.1'])], 'unclear': ''})
    out = agent_edit.propose('đổi cột AI lifecycle của dự án I.2.6.1 từ bước 5 thành bước 10', rows, FN)
    assert not out['proposals'] and 'I.A.2.6.1 hoặc I.B.2.6.1' in out['answer']


STEPS = [f'Bước {i}' for i in range(1, 13)]
FSTEP = [{'id': 'lc', 'name': 'AI Lifecycle', 'options': STEPS}]
RSTEP = [{'code': 'DA01', 'name': 'Nhận diện khuôn mặt', 'values': {'lc': 'Bước 8'}}]


@pytest.mark.parametrize('said,want', [('bước cuối cùng', 'Bước 12'), ('Bước cuối', 'Bước 12'), ('bước đầu tiên', 'Bước 1'), ('bước 10', 'Bước 10'), ('1', 'Bước 1'), ('bước 5', 'Bước 5')])
def test_ordered_steps_last_first_and_number(monkeypatch, said, want):
    seen = ai_returns(monkeypatch, {'ops': [op('lc', said, codes=['DA01'])], 'unclear': ''})
    out = agent_edit.propose('Đổi thành ' + said + ' cho DA01', RSTEP, FSTEP, history=[{'q': 'đổi bước AI lifecycle của DA01', 'codes': ['DA01'], 'a': ''}])
    assert [(p['code'], p['to']) for p in out['proposals']] == [('DA01', want)]
    assert 'Bước 12' in seen['user'] and '"cuoi"' in seen['user']   # V-LLM được đưa giá trị đầu / cuối của danh sách


def test_unknown_step_is_not_guessed(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('lc', 'bước 99', codes=['DA01'])], 'unclear': ''})
    out = agent_edit.propose('đổi AI lifecycle của DA01 thành bước 99', RSTEP, FSTEP)
    assert not out['proposals'] and 'không có trong danh sách' in out['answer']


def test_guessed_all_scope_is_asked_back_with_count_not_silently_dropped(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('ghichu', 'Chờ họp khối', all_=True)], 'unclear': ''})
    out = agent_edit.propose('Ghi chú "Chờ họp khối" giúp mình', ROWS, FIELDS)
    assert out['proposals'] == [] and 'tất cả 4 dự án, phải không?' in out['answer']


def test_guessed_condition_scope_is_asked_back(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('rui', 'Cao', wf='td', wv='Chậm tiến độ')], 'unclear': ''})
    out = agent.ask('đổi mức rủi ro thành cao', ROWS, FIELDS, None, True)
    assert out['proposals'] == [] and 'Tiến độ là “Chậm tiến độ”, phải không?' in out['answer']


def test_reply_to_a_confirmation_question_trusts_the_scope_ai_read(monkeypatch):
    hist = [{'q': 'đổi mức rủi ro thành cao', 'codes': [], 'a': 'Agent chưa đề xuất thay đổi nào. Chưa rõ sửa Mức độ rủi ro cho dự án nào. Mình đoán bạn muốn sửa cho các dự án có Tiến độ là “Chậm tiến độ”, phải không?'}]
    ai_returns(monkeypatch, {'ops': [op('rui', 'Cao', wf='td', wv='Chậm tiến độ')], 'unclear': ''})
    out = agent_edit.propose('chuẩn rồi, làm đi', ROWS, FIELDS, history=hist)
    assert [p['code'] for p in out['proposals']] == ['DA03']   # DA01 đã Cao; câu "chuẩn rồi" không có từ chỉ phạm vi nhưng là trả lời cho câu xác nhận


def test_without_a_confirmation_question_the_same_reply_is_still_guarded(monkeypatch):
    ai_returns(monkeypatch, {'ops': [op('rui', 'Cao', wf='td', wv='Chậm tiến độ')], 'unclear': ''})
    out = agent_edit.propose('chuẩn rồi, làm đi', ROWS, FIELDS, history=[{'q': 'x', 'codes': [], 'a': 'Mình đã soạn 1 thay đổi'}])
    assert out['proposals'] == []


def test_only_empty_wins_when_ai_misreads_pronoun_as_project_code(monkeypatch):
    """"điền các domain còn thiếu cho t thành Food": AI nhầm "t" (tôi) thành điều kiện Mã DA = t; ô trống đã là phạm vi nên bỏ điều kiện đó."""
    fields = FIELDS + [{'id': 'ma', 'name': 'Mã DA'}, {'id': 'domain', 'name': 'Domain', 'options': ['Food', 'Voice']}]
    rows = [{'code': r['code'], 'values': {**r['values'], 'ma': r['code'], 'domain': d}} for r, d in zip(ROWS, ['', 'Voice', '', ''])]
    ai_returns(monkeypatch, {'ops': [op('domain', 'Food', wf='ma', wv='t', only_empty=True)], 'unclear': ''})
    res = agent_edit.propose('điền các domain còn thiếu cho t thành Food hết', rows, fields)
    assert [p['code'] for p in res['proposals']] == ['DA01', 'DA03', 'DA04']
    assert all(p['field'] == 'domain' and p['to'] == 'Food' for p in res['proposals'])
    assert res['applied'] is False


def test_pronoun_rule_and_empty_synonyms_are_in_edit_prompt():
    assert 'còn thiếu' in agent_edit.SYSTEM and 'KHÔNG BAO GIỜ là mã dự án' in agent_edit.SYSTEM

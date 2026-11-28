"""Chế độ chat (AI_AGENT_MODE=chat): V-LLM thấy bảng + hội thoại, tự tra bằng công cụ tổng quát; code kiểm số và mã."""
import json

import pytest

from server.app.ai.agent import chat, qa
from server.app.ai.llm import VllmError
from server.app.ai.settings import settings

ROWS = qa._clean_rows([
    {'code': 'I.A.1.1', 'name': 'Nền tảng A/B', 'group': 'Platform', 'status': 'Đang thực hiện', 'progress': 'Chậm tiến độ', 'risk': 'Cao',
     'pic': 'Bùi Thanh Hằng', 'end': '10/12/2026', 'priority': 'High', 'issue': 'Đang chờ GPU từ hạ tầng, trễ 2 tuần.', 'plan': 'Chạy UAT.'},
    {'code': 'I.A.2.1', 'name': 'Voicebot', 'group': 'Voice', 'status': 'Đang thực hiện', 'progress': 'Đúng tiến độ', 'risk': 'Thấp',
     'pic': 'Nguyễn Văn An', 'end': '30/12/2026', 'priority': 'Medium', 'issue': '', 'plan': 'Bàn giao.'},
    {'code': 'II.A.1.1', 'name': 'OCR hóa đơn', 'group': 'Vision', 'status': 'Đã hoàn thành', 'progress': 'Đúng tiến độ', 'risk': 'Thấp',
     'pic': 'Bùi Thanh Hằng', 'end': '01/11/2026', 'priority': 'High', 'issue': 'Thiếu người kiểm thử.', 'plan': ''},
])
RAW = [dict(r, jiraProgress=r['jira_progress']) for r in ROWS]


@pytest.fixture
def agent(monkeypatch):
    """V-LLM giả chạy theo kịch bản: mỗi bước là ('tool', tên, tham số) hoặc ('text', câu trả lời)."""
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(settings, 'agent_mode', 'chat', raising=False)
    monkeypatch.setattr(qa, '_today', lambda: __import__('datetime').date(2026, 11, 25))
    st = {'script': [], 'seen': []}

    def fake_tools(msgs, tools, max_tokens=None, **k):
        st['seen'].append([dict(x) for x in msgs])
        kind, *rest = st['script'].pop(0) if st['script'] else ('text', 'Xin chào')
        if kind == 'tool':
            return {'content': '', 'tool_calls': [{'id': f'c{len(st["seen"])}', 'name': rest[0], 'arguments': rest[1]}], 'finish': 'tool_calls', 'usage': {}, 'model': 'v-llm', 'ms': 1}
        if kind == 'error':
            raise VllmError('hỏng', 500)
        return {'content': rest[0], 'tool_calls': [], 'finish': 'stop', 'usage': {}, 'model': 'v-llm', 'ms': 1}
    monkeypatch.setattr(qa.client, 'chat_tools', fake_tools)
    monkeypatch.setattr(chat.client, 'chat_tools', fake_tools)
    monkeypatch.setattr(qa.client, 'chat_json', lambda msgs, schema, max_tokens=None, **k: {'model': 'm', 'data': {'answer': 'ok', 'codes': []}})
    return st


def test_ai_sees_table_with_masked_names_and_the_whole_conversation(agent):
    agent['script'] = [('text', 'Có 1 dự án.')]
    hist = [{'q': 'dự án nào chậm', 'codes': ['I.A.1.1'], 'a': 'I.A.1.1 đang chậm tiến độ vì chờ GPU.'}]
    qa.ask('ý tôi là vì sao', RAW, history=hist)
    msgs = agent['seen'][0]
    system = msgs[0]['content']
    assert 'I.A.1.1 | Nền tảng A/B' in system and 'Đang chờ GPU' in system and 'Bùi Thanh Hằng' not in system and '[Người' in system
    assert [m['role'] for m in msgs[1:]] == ['user', 'assistant', 'user'] and 'chờ GPU' in msgs[2]['content'] and msgs[3]['content'] == 'ý tôi là vì sao'


def test_listing_a_column_is_composed_by_the_ai_not_by_rules(agent):
    agent['script'] = [('tool', 'truy_van_bang', {'dieu_kien': [{'cot': 'van_de', 'phep': 'khong_trong'}], 'cot_xem': ['van_de']}),
                       ('text', '- I.A.1.1: chờ GPU, trễ 2 tuần\n- II.A.1.1: thiếu người kiểm thử')]
    out = qa.ask('ý tôi là liệt kê ra mỗi dự án đang gặp vấn đề gì', RAW)
    assert out['intent'] == 'chat' and out['codes'] == ['I.A.1.1', 'II.A.1.1'] and out['grounded']
    res = json.loads(agent['seen'][1][-1]['content'])
    assert res['so_luong'] == 2 and [d['ma'] for d in res['du_an']] == ['I.A.1.1', 'II.A.1.1'] and 'GPU' in res['du_an'][0]['van_de']


def test_numbers_must_come_from_tool_results_or_the_ai_is_asked_to_look_up(agent):
    agent['script'] = [('text', 'Có 5 dự án ưu tiên High.'),        # tự đếm sai trên bảng
                       ('tool', 'truy_van_bang', {'dieu_kien': [{'cot': 'uu_tien', 'phep': '=', 'gia_tri': 'High'}]}),
                       ('text', 'Có 2 dự án ưu tiên High.')]
    out = qa.ask('có bao nhiêu dự án ưu tiên cao', RAW)
    assert out['answer'].endswith('Có 2 dự án ưu tiên High.') and out['grounded']
    assert 'Kiểm tra tự động' in agent['seen'][1][-1]['content'] and '5' in agent['seen'][1][-1]['content']


def test_still_wrong_after_one_reminder_is_flagged(agent):
    agent['script'] = [('text', 'Có 7 dự án.'), ('text', 'Có 7 dự án.')]
    out = qa.ask('có bao nhiêu dự án', RAW)
    assert not out['grounded'] and any('7' in w for w in out['warnings'])


def test_unknown_project_code_is_flagged(agent):
    agent['script'] = [('text', 'Dự án I.Z.9.9 đang chậm.'), ('text', 'Dự án I.Z.9.9 đang chậm.')]
    assert not qa.ask('dự án nào chậm', RAW)['grounded']


def test_query_filters_sort_group_and_dates():
    m = qa._masker(ROWS)
    import datetime
    qa_today = qa._today
    qa._today = lambda: datetime.date(2026, 11, 25)
    try:
        q = chat.query_table
        assert q({'dieu_kien': [{'cot': 'phu_trach', 'phep': '=', 'gia_tri': m.mask('Bùi Thanh Hằng')}]}, ROWS, m)['so_luong'] == 2
        assert q({'dieu_kien': [{'cot': 'han', 'phep': '<=', 'gia_tri': 'hom_nay+20'}, {'cot': 'trang_thai', 'phep': '!=', 'gia_tri': 'Đã hoàn thành'}]}, ROWS, m)['so_luong'] == 1
        assert q({'nhom_theo': 'uu_tien'}, ROWS, m)['dem'] == {'High': 2, 'Medium': 1}
        assert [d['ma'] for d in q({'sap_xep': 'han', 'giam_dan': True, 'gioi_han': 2}, ROWS, m)['du_an']] == ['I.A.2.1', 'I.A.1.1']
        assert q({'dieu_kien': [{'cot': 'van_de', 'phep': 'co_chua', 'gia_tri': 'gpu'}]}, ROWS, m)['so_luong'] == 1
        assert q({'dieu_kien': [{'cot': 'tien_do', 'phep': 'thuoc', 'gia_tri': 'Chậm tiến độ|Có nguy cơ chậm'}]}, ROWS, m)['so_luong'] == 1
        assert q({'dieu_kien': [{'cot': 'so_ngay_den_han', 'phep': '<', 'gia_tri': '0'}]}, ROWS, m)['so_luong'] == 0   # dự án quá hạn duy nhất đã hoàn thành
    finally:
        qa._today = qa_today


def test_change_requests_still_go_through_preview(agent):
    agent['script'] = [('tool', 'sua_bang', {})]
    out = qa.ask('I.A.1.1 chờ họp nhé', RAW, fields=[{'k': 'note', 'label': 'Ghi chú'}])
    assert out.get('route', {}).get('query') == 'edit'
    agent['script'] = [('tool', 'hoi_lai', {'cau_hoi': 'Bạn muốn xem tuần nào?', 'lua_chon': ['Tuần 3', 'Tuần 4']})]
    out = qa.ask('xem cái đó', RAW)
    assert out['facts']['kieu'] == 'hoi_lai' and out['facts']['lua_chon'] == ['Tuần 3', 'Tuần 4']


def test_falls_back_to_tools_mode_when_vllm_fails(agent):
    agent['script'] = [('error',), ('tool', 'loc_du_an', {'dieu_kien': [{'cot': 'tien_do', 'gia_tri': 'Chậm tiến độ'}]})]
    out = qa.ask('dự án nào chậm', RAW)
    assert out['intent'] in ('filter', 'analyze') and 'chatError' in out['timing']


def test_short_name_resolution_still_runs_before_chat(agent):
    agent['script'] = [('tool', 'truy_van_bang', {'dieu_kien': [{'cot': 'phu_trach', 'phep': '=', 'gia_tri': '[Người 1]'}]}), ('text', 'Có 2 dự án.')]
    out = qa.ask('Hằng có mấy dự án', RAW)
    assert out['answer'].startswith('Mình hiểu "Hằng" là Bùi Thanh Hằng.')
    assert '[Người' in agent['seen'][0][-1]['content'] and 'Hằng' not in agent['seen'][0][-1]['content']


def test_numbered_lists_and_week_names_are_not_counts(agent):
    agent['script'] = [('tool', 'truy_van_bang', {'dieu_kien': [{'cot': 'tien_do', 'phep': '=', 'gia_tri': 'Chậm tiến độ'}]}),
                       ('text', 'Tuần 4 có 1 dự án chậm (33% bảng):\n1. I.A.1.1: chờ GPU, trễ 2 tuần')]
    out = qa.ask('dự án nào chậm', RAW)
    assert out['grounded'], out['warnings']


def test_tool_call_written_as_text_is_run_as_a_real_call(agent):
    leak = '{"function": "truy_van_bang", "arguments": {"dieu_kien": [{"cot": "uu_tien", "phep": "=", "gia_tri": "High"}]}} </tool_call>'
    agent['script'] = [('text', leak), ('text', 'Có 2 dự án ưu tiên High: I.A.1.1 và II.A.1.1.')]
    out = qa.ask('dự án nào ưu tiên High', RAW)
    assert out['answer'] == 'Có 2 dự án ưu tiên High: I.A.1.1 và II.A.1.1.' and out['grounded']
    assert json.loads(agent['seen'][1][-1]['content'])['so_luong'] == 2


def test_due_soon_skips_finished_projects():
    import datetime
    m = qa._masker(ROWS)
    old = qa._today
    qa._today = lambda: datetime.date(2026, 11, 25)
    try:
        soon = chat.query_table({'dieu_kien': [{'cot': 'so_ngay_den_han', 'phep': '>=', 'gia_tri': '0'}, {'cot': 'so_ngay_den_han', 'phep': '<=', 'gia_tri': '20'}]}, ROWS, m)
        assert [d['ma'] for d in soon['du_an']] == ['I.A.1.1']
        late = chat.query_table({'dieu_kien': [{'cot': 'so_ngay_den_han', 'phep': '<', 'gia_tri': '0'}]}, ROWS, m)
        assert late['so_luong'] == 0        # II.A.1.1 hạn 01/11 nhưng đã hoàn thành: không phải quá hạn
    finally:
        qa._today = old


def test_check_reminder_is_a_system_note_and_the_better_answer_is_kept(agent):
    agent['script'] = [('text', 'I.A.1.1 (Nền tảng A/B) đang chậm tiến độ.'), ('text', 'Tôi không thấy con số 8 nào.')]
    agent['script'][0] = ('text', 'I.A.1.1 (Nền tảng A/B) có 8 việc.')
    out = qa.ask('Nền tảng A/B thế nào', RAW)
    note = agent['seen'][1][-1]
    assert note['role'] == 'system' and 'người dùng không thấy' in note['content']
    assert out['answer'] in ('I.A.1.1 (Nền tảng A/B) có 8 việc.', 'Tôi không thấy con số 8 nào.')


def test_numbers_quoted_from_a_project_named_without_code_are_allowed(agent):
    agent['script'] = [('text', '**Nền tảng A/B** đang chờ GPU, trễ 2 tuần.')]
    out = qa.ask('Nền tảng A/B đang vướng gì', RAW)
    assert out['grounded'] and out['answer'] == 'Nền tảng A/B đang chờ GPU, trễ 2 tuần.'   # bỏ ** của markdown


def test_every_way_of_writing_a_tool_call_as_text_is_understood():
    names = {'truy_van_bang'}
    args = {'dieu_kien': [{'cot': 'uu_tien', 'phep': '=', 'gia_tri': 'High'}]}
    for text in ('{"function": "truy_van_bang", "arguments": %s}' % json.dumps(args),
                 'Mình tra nhé {"function": {"name": "truy_van_bang", "arguments": %s}}' % json.dumps(args),
                 '<tool_call>{"name": "truy_van_bang", "parameters": %s}</tool_call>' % json.dumps(args),
                 '{"name": "truy_van_bang", "arguments": %s}' % json.dumps(json.dumps(args))):
        got = chat._tool_in_text(text, names)
        assert got and got['name'] == 'truy_van_bang' and got['arguments'] == args, text
    assert chat._tool_in_text('Có 2 dự án {không phải json}', names) is None
    assert chat._tool_in_text('{"name": "xoa_het", "arguments": {}}', names) is None

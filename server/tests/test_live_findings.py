"""Các câu sai ở lần chạy V-LLM thật đầu tiên trên file 64DA (28/11/2026). V-LLM giả trả lại đúng cách V-LLM thật đã trả;
code phải sửa được hoặc chặn được."""
import json
from datetime import date

import pytest

from evals import qa_truth as T
from server.app.ai import rag
from server.app.ai.agent import edit as agent_edit, qa as agent
from server.app.ai.settings import settings

TODAY = date(2026, 11, 25)


@pytest.fixture(scope='module')
def rows():
    rs = T.load_report_rows(T.DEFAULT_FILE, T.DEFAULT_CYCLE)
    return T.agent_rows(rs, TODAY, 'w4')


@pytest.fixture(autouse=True)
def today(monkeypatch):
    monkeypatch.setattr(agent, '_today', lambda: TODAY)
    monkeypatch.setattr(settings, 'rag_embeddings', False, raising=False)
    monkeypatch.setattr(settings, 'rerank_model', '', raising=False)


def _router_says(monkeypatch, route: dict):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(settings, 'agent_mode', 'router', raising=False)
    base = {'y_dinh': '', 'doi_tuong': 'ca_bang', 'ma_du_an': '', 'query': 'unknown', 'field': '', 'value': '', 'filters': [], 'group_by': '', 'sort': '',
            'limit': 0, 'due': '', 'text': '', 'expand_top': False, 'list_each': False, 'fields': [], 'search_queries': [], 'detail': '', 'refers_previous': False}

    def fake(msgs, schema, max_tokens=None, **k):
        if 'query' in (schema.get('properties') or {}):
            return {'model': 'm', 'data': {**base, **route}}
        return {'model': 'm', 'data': {'answer': '', 'codes': []}}   # câu trả lời rỗng: dùng câu mẫu do code viết
    monkeypatch.setattr(agent.client, 'chat_json', fake)


def _tools_say(monkeypatch, name, args):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(settings, 'agent_mode', 'tools', raising=False)
    it = iter([(name, args)])

    def fake_tools(msgs, tools, max_tokens=None, **k):
        n, a = next(it, (None, None))
        calls = [{'id': 'c', 'name': n, 'arguments': a}] if n else []
        return {'content': '', 'tool_calls': calls, 'finish': 'stop', 'usage': {}, 'model': 'm', 'ms': 1}
    monkeypatch.setattr(agent.client, 'chat_tools', fake_tools)
    monkeypatch.setattr(agent.client, 'chat_json', lambda *a, **k: {'model': 'm', 'data': {'answer': '', 'codes': []}})


PIC_CODES = {'I.1.7.2', 'I.4.3.1', 'I.A.5.3', 'I.C.1.7', 'II.A.1.1', 'II.E.1.5', 'x.x.24'}


def test_person_put_into_the_priority_column_becomes_a_person_filter(monkeypatch, rows):
    # router: V-LLM chọn filter Ưu tiên = [Người n]
    _router_says(monkeypatch, {'query': 'filter', 'field': 'uu_tien', 'value': '[Người 1]'})
    out = agent.ask('Bùi Thanh Hằng phụ trách những dự án nào?', rows)
    assert set(out['scope']) == PIC_CODES


def test_person_counted_by_person_lists_that_persons_projects(monkeypatch, rows):
    # tools: V-LLM gọi loc_du_an đếm theo phu_trach
    _tools_say(monkeypatch, 'loc_du_an', {'dieu_kien': [], 'dem_theo': 'phu_trach'})
    out = agent.ask('Bùi Thanh Hằng phụ trách những dự án nào?', rows)
    assert set(out['scope']) == PIC_CODES


def test_search_in_one_project_uses_the_code_in_the_question(monkeypatch, rows):
    # tools: V-LLM tìm ô Comment nhưng không điền ma_du_an
    _tools_say(monkeypatch, 'tim_noi_dung', {'chu_de': 'comment gần nhất', 'o_can_tim': ['comment']})
    out = agent.ask('Comment gần nhất của I.A.3.1 nói gì?', rows)
    assert out['facts']['doan'] and {d['code'] for d in out['facts']['doan']} == {'I.A.3.1'}


def test_project_card_carries_subtask_counts(monkeypatch, rows):
    _router_says(monkeypatch, {'query': 'project', 'value': 'I.A.3.1', 'ma_du_an': 'I.A.3.1'})
    out = agent.ask('I.A.3.1 còn bao nhiêu subtask chưa xong?', rows)
    assert out['facts']['du_an']['subtask'] == '3/5 subtask đã xong, còn 2 chưa xong'


def test_rare_term_keeps_every_project_that_has_it(rows):
    got = rag.search('Dự án nào nhắc tới GPU?', agent._clean_rows(rows))
    assert {'I.C.1.14', 'II.E.1.5'} <= {p['code'] for p in got['passages']}
    assert rag._exact_rare('dự án nào chậm', rag.build_passages(agent._clean_rows(rows))) == []   # chữ thường gặp không tính là hiếm


def test_all_projects_drops_a_group_condition_the_question_never_said(monkeypatch):
    fields = [{'id': 'ghichu', 'name': 'Ghi chú', 'options': []}, {'id': 'mang', 'name': 'Mảng', 'options': ['Food', 'Ride']}]
    erows = [{'code': c, 'name': n, 'values': {'ghichu': '', 'mang': g}} for c, n, g in (('A.1', 'Một', 'Food'), ('A.2', 'Hai', 'Ride'), ('A.3', 'Ba', 'Food'))]
    plan = {'ops': [{'field': 'ghichu', 'value': 'đang theo dõi', 'codes': [], 'where_field': 'mang', 'where_value': 'Food', 'only_empty': False, 'all': True}], 'unclear': ''}
    monkeypatch.setattr(settings, 'mode', 'vllm')
    monkeypatch.setattr(agent_edit.client, 'chat_json', lambda *a, **k: {'model': 'm', 'ms': 1, 'usage': {}, 'data': plan})
    out = agent_edit.propose('tất cả dự án ghi chú đang theo dõi', erows, fields)
    assert {p['code'] for p in out['proposals']} == {'A.1', 'A.2', 'A.3'}


def test_score_accepts_same_meaning_and_zero_projects():
    assert T.score({'kind': 'chu', 'expect': ['I.A.3.1', T.PROGRESS_SAY['Đúng tiến độ']]}, {'answer': 'Dự án đang đúng kế hoạch', 'codes': ['I.A.3.1']})[0]
    assert T.score({'kind': 'ma', 'expect': []}, {'answer': 'có 0 dự án quá hạn', 'scope': ['I.A.1.1']})[0]
    assert T.score({'kind': 'chu', 'expect': ['buổi', 'rollout', 'Khối']}, {'answer': 'chốt phương án rollout toàn quốc'})[0]

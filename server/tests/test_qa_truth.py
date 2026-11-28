"""Bộ câu hỏi có đáp án tính từ file Jira thật (evals/qa_truth.py): đáp án đúng với file, và tầng code (không AI) trả lời đúng."""
from datetime import date

from evals import qa_truth as T

TODAY = date(2026, 11, 25)


def _data():
    rows = T.load_report_rows(T.DEFAULT_FILE, T.DEFAULT_CYCLE)
    return rows, T.agent_rows(rows, TODAY, 'w4')


def test_file_gives_64_projects_and_week4_is_this_week():
    rows, arows = _data()
    assert len(rows) == 64
    a = next(x for x in arows if x['code'] == 'I.A.3.1')
    r = next(x for x in rows if x.ma == 'I.A.3.1')
    assert a['done'] == r.w4ht[:T.MAX_TEXT].strip() and a['done']
    assert a['prev'].startswith('Tuần 1 – ') and 'Tuần 3 – ' in a['prev'] and 'Tuần 4' not in a['prev']


def test_finished_projects_are_not_late_and_jira_at_risk_counts():
    rows, arows = _data()
    prog = {a['code']: a['progress'] for a in arows}
    done = [r.ma for r in rows if r.tt == 'Đã hoàn thành']
    assert done and all(prog[c] != 'Chậm tiến độ' for c in done)       # 12 dự án xong ngày 15/11 không phải "chậm" vào 25/11
    assert all(prog[r.ma] == 'Có nguy cơ chậm' for r in rows if r.td == 'Có rủi ro')


def test_cases_are_computed_from_the_file():
    rows, arows = _data()
    cases = {c['id']: c for c in T.build_cases(rows, arows, TODAY, 'w4')}
    assert cases['C01']['expect'] == 64 and cases['C02']['expect'] == 12
    assert cases['C04']['expect'] == ['I.C.1.14'] and cases['C09']['expect'] == 13
    assert cases['C21']['expect'] == ['I.A.4.3', 'I.A.5.2', 'II.A.2.2']
    assert cases['C24']['expect'] == ['10.Đánh giá An ninh Bảo mật (ANBM)'] and cases['C25']['expect'] == 32 and cases['C26']['expect'] == 2
    assert cases['C05']['expect'] == 3 and cases['C27']['expect'] == ['I.A.4.3', 'I.A.5.2', 'II.A.2.2']   # Jira "Late" = Chậm tiến độ
    assert {c['kind'] for c in cases.values()} == {'so', 'ma', 'chu', 'ma_mot_phan'}
    assert cases['C29']['history'] and all(cases[k].get('ai_only') for k in ('C28', 'C29', 'C31', 'C33'))   # cách hỏi tự nhiên: chỉ chấm khi có V-LLM


def test_step_priority_and_subtasks_reach_the_assistant():
    _, arows = _data()
    a = next(x for x in arows if x['code'] == 'I.A.3.1')
    assert a['step'].startswith('10.') and a['priority'] == 'High' and a['jiraProgress'] == 'On track'
    assert a['subtasks'].startswith('3/5 subtask đã xong, còn 2 chưa xong') and 'Nguyễn Minh Đức' not in a['subtasks']   # không gửi người được giao


def test_score_rules():
    assert T.score({'kind': 'so', 'expect': 12}, {'answer': 'Có 12/64 dự án đã hoàn thành'})[0]
    assert not T.score({'kind': 'so', 'expect': 12}, {'answer': 'Có 120 dự án'})[0]
    assert T.score({'kind': 'so', 'expect': 0}, {'answer': 'Không có dự án nào chậm'})[0]
    assert T.score({'kind': 'ma', 'expect': ['I.A.4.3']}, {'answer': 'x', 'scope': ['I.A.4.3']})[0]
    assert not T.score({'kind': 'ma', 'expect': ['I.A.4.3', 'I.A.5.2']}, {'answer': 'chỉ I.A.4.3'})[0]
    assert T.score({'kind': 'thieu_du_lieu', 'expect': 1}, {})[0] is None
    many = {'kind': 'ma_mot_phan', 'expect': ['A.1', 'A.2', 'A.3', 'A.4', 'A.5', 'A.6']}
    assert T.score(many, {'answer': 'x', 'codes': ['A.1', 'A.2', 'A.3', 'A.4', 'A.5']})[0]
    assert not T.score(many, {'answer': 'x', 'codes': ['A.1', 'A.2']})[0]
    assert not T.score(many, {'answer': 'x', 'codes': ['A.1', 'A.2', 'A.3', 'A.4', 'A.5', 'B.9']})[0]


def test_code_layer_answers_every_scored_case(monkeypatch, capsys):
    from server.app.ai.settings import settings
    monkeypatch.setattr(settings, 'mode', 'mock')
    assert T.run('offline', T.DEFAULT_FILE, T.DEFAULT_CYCLE, TODAY) == 0, capsys.readouterr().out

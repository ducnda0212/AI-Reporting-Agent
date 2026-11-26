"""Kiểm thử với V-LLM THẬT, dùng server/.env của bạn. Mặc định bỏ qua.

Chạy (PowerShell, ở thư mục gốc repo, đã mở venv):
    $env:RUN_LIVE="1"; python -m pytest -s server/tests/test_live_vllm.py
"""
import os
import time

import pytest

from app.ai.settings import SERVER_DIR, load
from app.ai.llm import VllmClient

LIVE = os.getenv('RUN_LIVE') == '1'
pytestmark = pytest.mark.skipif(not LIVE, reason='Đặt RUN_LIVE=1 để gọi V-LLM thật')


@pytest.fixture(scope='module')
def live():
    from dotenv import dotenv_values
    env = {k: v for k, v in dotenv_values(SERVER_DIR / '.env').items() if v is not None}
    cfg = load(env)
    assert cfg.mode == 'vllm', 'server/.env cần AI_MODE=vllm'
    assert not cfg.problems(), cfg.problems()
    return cfg, VllmClient(cfg)


def test_live_ping(live):
    cfg, c = live
    t = time.time()
    res = c.chat([{'role': 'user', 'content': 'Trả lời đúng một từ: OK'}], max_tokens=16, temperature=0)
    print(f"\n[ping] model={res['model']} reply={res['content']!r} {int((time.time() - t) * 1000)} ms usage={res['usage']}")
    assert 'OK' in res['content'].upper()


def test_live_models(live):
    _, c = live
    try:
        print('\n[models]', c.models())
    except Exception as e:  # một số tenant không mở /models
        pytest.skip(f'/models không dùng được: {e}')


def test_live_draft(live, monkeypatch):
    """Hai ca thật với V-LLM: (1) có rủi ro nhưng thiếu đề xuất, (2) không ghi rủi ro nhưng report có dấu hiệu."""
    from app.ai import drafts
    cfg, c = live
    monkeypatch.setattr(drafts, 'settings', cfg)
    monkeypatch.setattr(drafts, 'client', c)
    week = {'key': 'w3', 'start': '2026-11-15', 'end': '2026-11-22'}
    base = {'code': 'I.A.5.1', 'task': 'Gợi ý món theo thói quen đặt', 'status': 'In Progress', 'progress': 'Chậm tiến độ', 'late': True,
            'people': ['Nguyễn Văn An'], 'week': week,
            'weekReport': {'date': '2026-11-18', 'done': '- Hoàn thành API gợi ý v1\n- Đang chờ GPU để huấn luyện lại, anh Nguyễn Văn An đang xin hạ tầng',
                           'plan': '- Huấn luyện lại mô hình\n- Chạy thử A/B 5% người dùng'}}
    one = drafts.draft_row({**base, 'riskNotes': '||Date||Mô tả issue/risk||Todo||\n|{{2026-11-17}}|Thiếu GPU có thể lùi mốc A/B test 1 tuần| |\n'})
    two = drafts.draft_row(base)
    print('\n[action]', one, '\n[full]', two)
    for out in (one, two):
        assert out['riskLevel']['text'] in ('Cao', 'Trung bình', 'Thấp')
        assert out['issues']['suggestion'] and '→ Đề xuất:' in out['issues']['suggestion']['text']
        assert '[Người' not in out['issues']['suggestion']['text']
    assert one['issues']['need'] == 'action' and two['issues']['need'] == 'full'


def test_live_risk(live, monkeypatch):
    from app.ai import risk
    cfg, c = live
    monkeypatch.setattr(risk, 'settings', cfg)
    monkeypatch.setattr(risk, 'client', c)
    out = risk.assess('Mốc UAT với khách hàng lùi lần 2 (30/10 → 08/11 → 20/11). Tiến độ dev đứng ở 60% hai tuần liền.',
                      {'daysToDue': 3, 'weeksOpen': 2})
    print('\n[risk]', out['case']['kind'], out['case']['category'], out['case']['impact'], out['score']['priority'], out['score']['color'])
    print('       signals', out['case']['signals'], '| confidence', out['case']['confidence'])
    assert out['case']['category'] in risk.CATEGORIES


def test_live_agent(live, monkeypatch):
    """Agent hỏi đáp chỉ đọc với V-LLM thật: số liệu do code tính, câu trả lời phải bám số liệu."""
    from app.ai.agent import qa as agent
    cfg, c = live
    monkeypatch.setattr(agent, 'settings', cfg)
    monkeypatch.setattr(agent, 'client', c)
    rows = [{'code': 'DA01', 'name': 'Gợi ý món', 'group': 'Food', 'progress': 'Chậm tiến độ', 'risk': 'Cao', 'pic': 'Nguyễn Văn An', 'end': '30/11/2026', 'pending': True},
            {'code': 'DA02', 'name': 'Chấm điểm', 'group': 'Food', 'progress': 'Đúng tiến độ', 'risk': 'Thấp', 'pic': 'Trần Thị Bình', 'end': '15/12/2026', 'pending': False},
            {'code': 'DA03', 'name': 'Voicebot', 'group': 'Voice', 'progress': 'Chậm tiến độ', 'risk': 'Trung bình', 'pic': 'Lê Quang Huy', 'end': '20/11/2026', 'pending': True},
            {'code': 'DA04', 'name': 'OCR', 'group': 'Voice', 'progress': 'Có nguy cơ chậm', 'risk': 'Thấp', 'pic': '', 'end': '', 'pending': False}]
    for q, want in [('Dự án nào đang chậm tiến độ?', 2), ('Tóm tắt tuần này giúp mình', None), ('DA03 thế nào rồi?', None), ('Còn bao nhiêu nháp chờ duyệt?', 2), ('Mảng Voice có những dự án gì?', None)]:
        t = time.time()
        out = agent.ask(q, rows)
        print(f"\n[agent] {q!r} → {out['intent']} grounded={out['grounded']} chọn={out.get('routedBy')} viết={out['by']} tổng {int((time.time() - t) * 1000)} ms {out.get('timing')}\n        {out['answer']}  warnings={out['warnings']}")
        assert '[Người' not in out['answer']
        if want is not None:
            assert out['facts']['so_luong'] == want


def test_live_agent_edit(live, monkeypatch):
    """Agent đề xuất sửa ô với V-LLM thật: chỉ ra bản xem trước, không áp dụng."""
    from app.ai.agent import edit as agent_edit
    cfg, c = live
    monkeypatch.setattr(agent_edit, 'settings', cfg)
    monkeypatch.setattr(agent_edit, 'client', c)
    fields = [{'id': 'td', 'name': 'Tiến độ', 'options': ['Đúng tiến độ', 'Có nguy cơ chậm', 'Chậm tiến độ']},
              {'id': 'rui', 'name': 'Mức độ rủi ro', 'options': ['Cao', 'Trung bình', 'Thấp']},
              {'id': 'mang', 'name': 'Nhóm', 'options': ['Food', 'Voice']}, {'id': 'ghichu', 'name': 'Ghi chú'},
              {'id': 'tt', 'name': 'Trạng thái Jira', 'editable': False, 'lockedWhy': 'lấy thẳng từ Jira'}]
    rows = [{'code': 'DA01', 'values': {'td': 'Chậm tiến độ', 'rui': 'Cao', 'mang': 'Food', 'ghichu': '', 'tt': 'In Progress'}},
            {'code': 'DA02', 'values': {'td': 'Đúng tiến độ', 'rui': '', 'mang': 'Food', 'ghichu': '', 'tt': 'In Progress'}},
            {'code': 'DA03', 'values': {'td': 'Chậm tiến độ', 'rui': 'Trung bình', 'mang': 'Voice', 'ghichu': '', 'tt': 'Done'}},
            {'code': 'DA04', 'values': {'td': 'Có nguy cơ chậm', 'rui': '', 'mang': 'Voice', 'ghichu': '', 'tt': 'Done'}}]
    cases = [('Điền Mức độ rủi ro = Trung bình cho các dự án Food còn trống', {('DA02', 'rui', 'Trung bình')}),
             ('Chuyển DA03 sang đúng tiến độ', {('DA03', 'td', 'Đúng tiến độ')}),
             ('Đánh dấu rủi ro cao cho DA02 và DA04', {('DA02', 'rui', 'Cao'), ('DA04', 'rui', 'Cao')}),
             ('Ghi chú "Chờ họp khối" cho các dự án Voice', {('DA03', 'ghichu', 'Chờ họp khối'), ('DA04', 'ghichu', 'Chờ họp khối')}),
             ('Đổi Trạng thái Jira của DA01 thành Done', set()),
             ('sửa giúp cái kia', set())]
    ok = 0
    for q, want in cases:
        t = time.time()
        out = agent_edit.propose(q, rows, fields)
        got = {(p['code'], p['field'], p['to']) for p in out['proposals']}
        ok += got == want
        print(f"\n[edit] {q!r} by={out['by']} {int((time.time() - t) * 1000)} ms {'ĐÚNG' if got == want else 'SAI'}\n       {sorted(got)}\n       {out['answer']}")
        assert out['applied'] is False and all(p['code'] in {r['code'] for r in rows} for p in out['proposals'])
    print(f'\n[edit] đúng {ok}/{len(cases)} câu')

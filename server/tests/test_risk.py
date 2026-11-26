import pytest

from app.ai import risk
from app.ai.settings import settings

Z = {'delayDays': 0, 'financePct': 0, 'contract': 0, 'quality': 0, 'dataControl': 0}


def case(**kw):
    base = {'kind': 'Issue', 'category': 'C3', 'impact': dict(Z), 'daysToDue': 40, 'blocked': False, 'weeksOpen': 0,
            'noOwner': False, 'probability': '', 'signals': []}
    imp = kw.pop('impact', {})
    base.update(kw)
    base['impact'].update(imp)
    return base


@pytest.mark.parametrize('v,lv', [(0, 1), (1, 2), (4, 2), (5, 3), (14, 3), (15, 4), (99, 4)])
def test_level_thresholds_delay(v, lv):
    assert risk.level(v, (15, 5, 1)) == lv


# 8 ca mẫu của client (client/src/data/risk.ts) — Python phải ra đúng như TypeScript
CLIENT_CASES = [
    ('RI-01', case(impact={'delayDays': 12}, daysToDue=3, weeksOpen=2, signals=[['R03', '']]), 'P2', 'Đỏ'),
    ('RI-02', case(category='C5', impact={'quality': 4}, daysToDue=9, weeksOpen=1), 'P2', 'Vàng'),
    ('RI-03', case(kind='Dependency', category='C7', impact={'delayDays': 4}, daysToDue=8, weeksOpen=1, noOwner=True), 'P3', 'Vàng'),
    ('RI-04', case(category='C4', impact={'delayDays': 5}, daysToDue=20, weeksOpen=3), 'P2', 'Vàng'),
    ('RI-05', case(category='C1', impact={'financePct': 18}, daysToDue=6, weeksOpen=1), 'P2', 'Vàng'),
    ('RI-06', case(category='C2', impact={'contract': 3}, daysToDue=13, weeksOpen=5), 'P2', 'Vàng'),
    ('RI-07', case(category='C10', impact={'dataControl': 2}, daysToDue=3, weeksOpen=1), 'P3', 'Lưu ý dữ liệu'),
    ('RI-08', case(kind='Risk', probability='Thấp', category='C6', impact={'delayDays': 3}, daysToDue=35), 'P4', 'Xanh'),
]


@pytest.mark.parametrize('cid,c,prio,color', CLIENT_CASES, ids=[x[0] for x in CLIENT_CASES])
def test_score_matches_client(cid, c, prio, color):
    sc = risk.score(c)
    assert (sc['priority'], sc['color']) == (prio, color)


def test_urgency_rules():
    assert risk.score(case(blocked=True))['baseUrgency'] == 4
    assert risk.score(case(daysToDue=-1))['baseUrgency'] == 4
    assert risk.score(case(daysToDue=7))['baseUrgency'] == 3
    assert risk.score(case(daysToDue=30))['baseUrgency'] == 2
    sc = risk.score(case(daysToDue=-5, weeksOpen=4, noOwner=True))
    assert sc['urgency'] == 4  # chặn trần 4
    assert risk.score(case(kind='Risk', probability='Thấp', daysToDue=99))['urgency'] == 1  # chặn sàn 1


def test_p1_and_category_override():
    sc = risk.score(case(impact={'quality': 4}, daysToDue=2))
    assert sc['score'] == 12 and sc['priority'] == 'P1' and sc['color'] == 'Đỏ'
    assert risk.score(case(impact={'dataControl': 2}, daysToDue=40), category_override='C10')['color'] == 'Lưu ý dữ liệu'


def test_schema_is_strict():
    assert risk.SCHEMA['additionalProperties'] is False and set(risk.SCHEMA['required']) == set(risk.SCHEMA['properties'])
    assert 'C10' in risk.SCHEMA['properties']['category']['enum']


def test_assess_mock(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'mock')
    out = risk.assess('Tỉ lệ bug nội bộ 22%', {'daysToDue': 9, 'weeksOpen': 1})
    assert out['case']['category'] == 'C5' and out['model'] == 'mock' and out['score']['priority'] == 'P3'
    assert out['standardAction'] == 'Kế hoạch khắc phục trong 20 ngày làm việc'


def test_assess_vllm_masks_people_and_uses_system_score(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    seen = {}

    def fake(msgs, schema, max_tokens=None):
        seen['msg'] = msgs[-1]['content']
        return {'model': 'v-llm-v1-large', 'data': {
            'kind': 'Dependency', 'probability': '', 'category': 'C7', 'why': 'Chờ [Người 1]', 'delayDays': 4, 'financePct': 0,
            'contract': 0, 'quality': 0, 'dataControl': 0, 'blocked': False, 'noOwner': True,
            'signals': [{'code': 'R10', 'note': 'chưa có đầu mối'}], 'actions': [{'text': 'Cử đầu mối', 'owner': 'PM', 'due': '19/11'}],
            'closeWhen': 'Đã nhận dữ liệu', 'confidence': 'high', 'uncertainty': '', 'alternativeCategory': '', 'missingInfo': []}}
    monkeypatch.setattr(risk.client, 'chat_json', fake)
    out = risk.assess('Chưa nhận dữ liệu từ anh Đỗ Văn Nam', {'daysToDue': 8, 'weeksOpen': 1, 'people': ['Đỗ Văn Nam']})
    assert 'Đỗ Văn Nam' not in seen['msg']
    assert out['case']['why'] == 'Chờ Đỗ Văn Nam' and out['case']['signals'] == [['R10', 'chưa có đầu mối']]
    # người phụ trách không bắt buộc: cờ noOwner của AI bị bỏ nên không nâng độ gấp
    assert out['case']['noOwner'] is False
    assert out['score']['priority'] == 'P3' and out['score']['urgency'] == 2


def test_assess_drops_r02_and_computes_delay_from_dates(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'vllm')
    data = {'kind': 'Issue', 'probability': '', 'category': 'C3', 'why': 'x', 'delayDays': 21, 'financePct': 0, 'contract': 0, 'quality': 0,
            'dataControl': 0, 'blocked': False, 'noOwner': True, 'signals': [{'code': 'R02', 'note': 'thiếu người phụ trách'}, {'code': 'R03', 'note': 'lùi hạn'}],
            'actions': [], 'closeWhen': '', 'confidence': 'low', 'uncertainty': '', 'alternativeCategory': '', 'missingInfo': []}
    monkeypatch.setattr(risk.client, 'chat_json', lambda *a, **k: {'model': 'm', 'data': dict(data)})
    out = risk.assess('Mốc UAT lùi', {'daysToDue': -12, 'weeksOpen': 2})
    assert [x[0] for x in out['case']['signals']] == ['R03'] and out['case']['impact']['delayDays'] == 12


def test_delay_days_kept_when_stated_in_text_but_overridden_when_ai_computed(monkeypatch):
    from app.ai import risk
    from app.ai.settings import settings
    monkeypatch.setattr(settings, 'mode', 'vllm')
    base = {'kind': 'Issue', 'probability': '', 'category': 'C3', 'why': 'x', 'financePct': 0, 'contract': 0, 'quality': 0,
            'dataControl': 0, 'blocked': False, 'noOwner': False, 'signals': [], 'actions': [], 'closeWhen': '', 'confidence': 'high',
            'uncertainty': '', 'alternativeCategory': '', 'missingInfo': []}
    txt = 'Mốc UAT dự kiến trễ 12 ngày; hạn UAT đã qua 2 ngày.'
    for ai_days, want in ((12, 12), (21, 2)):
        monkeypatch.setattr(risk.client, 'chat_json', lambda *a, _d=ai_days, **k: {'data': {**base, 'delayDays': _d}, 'model': 'm'})
        assert risk.assess(txt, {'daysToDue': -2})['case']['impact']['delayDays'] == want

"""Script đánh giá 6 tiêu chí (evals/run_eval.py): kiểm tra đáp án chuẩn và các hàm đo, không gọi AI."""
from server.app.ai.settings import settings
from evals import run_eval as E


def test_cases_loaded_and_reference_matches_workbook():
    cases = E.load_cases()
    assert len(cases) == 26 and cases[0]['id'] == 'V01'
    diff = {c['id'] for c in cases if c['status'] != 'Đã đóng' and E.reference_priority(c)[0] != c['expect']['priority']}
    assert diff == {'V11', 'V15'}   # chỉ lệch ở ca bộ tiêu chí cộng +1 "thiếu hạn/PIC" (đã bỏ có chủ đích)


def test_ungrounded_detects_invented_numbers_and_escalation():
    src = 'Chờ GPU, hạn 20/11, dự kiến trễ 3 ngày'
    assert E.ungrounded('Chốt ETA GPU trong 3 ngày', src) == []
    assert E.ungrounded('Nếu trễ quá 7 ngày, báo cáo lãnh đạo TT', src) == ['số 7 trong "Nếu trễ quá 7 ngày"', 'lãnh đạo']
    assert E.percentile([1, 2, 3, 4, 100], 0.95) == 100


def test_mock_run_produces_all_sections(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'mock')
    cases = E.load_cases()[:4]
    assess = E.run_assess(cases)
    draft, stripped = E.run_draft(cases)
    m = E.evaluate(cases, assess, draft, stripped)
    assert {'1 Độ chính xác', '2 Bám nguồn', '3 Tính đầy đủ', '4 Tuân thủ chỉ dẫn', '5 Nhận biết bối cảnh', '6 Chỉ số riêng', 'Hiệu năng'} <= set(m)
    assert m['Hiệu năng']['assess']['thành công'].startswith('4/4')

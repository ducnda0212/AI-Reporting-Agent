"""Câu hỏi chỉ gọi tên một cột nội dung ("vướng mắc của các dự án là gì"): liệt kê cột đó, không tìm theo nghĩa."""
from server.app.ai.agent import qa
from server.app.ai.masking import Masker

ROWS = qa._clean_rows([
    {'code': 'A1', 'name': 'Dự án A', 'progress': 'Đúng tiến độ', 'risk': 'Thấp', 'issue': 'Đang chờ GPU từ hạ tầng.', 'plan': 'Chạy UAT.'},
    {'code': 'B2', 'name': 'Dự án B', 'progress': 'Chậm tiến độ', 'risk': 'Cao', 'issue': 'Thiếu người kiểm thử.', 'plan': ''},
    {'code': 'C3', 'name': 'Dự án C', 'progress': 'Đúng tiến độ', 'risk': 'Thấp', 'issue': '', 'plan': 'Bàn giao.'},
])
SPEC = {'query': 'search', 'field': '', 'value': ''}


def _ask(q, spec=SPEC):
    return qa.compute(dict(spec), ROWS, q, Masker([]), {})


def test_column_name_question_lists_that_column_late_projects_first():
    f = _ask('vướng mắc của các dự án là gì')
    assert f['cach_tim'] == 'theo cột' and f['so_du_an'] == 2
    assert [d['code'] for d in f['doan']] == ['B2', 'A1']      # dự án chậm lên trước, C3 không có vướng mắc thì không có mặt
    assert 'B2' in qa.template(f) and 'C3' not in qa.template(f)


def test_other_column_names_work_too():
    assert [d['code'] for d in _ask('kế hoạch tuần tới của các dự án')['doan']] == ['A1', 'C3']
    assert _ask('các dự án đang có vấn đề gì')['cach_tim'] == 'theo cột'


def test_question_with_a_topic_still_searches_by_content():
    assert _ask('dự án nào đang chờ GPU').get('cach_tim') != 'theo cột'
    assert _ask('vướng mắc về GPU').get('cach_tim') != 'theo cột'


def test_fields_chosen_by_the_tool_are_respected():
    f = _ask('các dự án thế nào rồi', {**SPEC, 'fields': ['plan']})
    assert f.get('cach_tim') != 'theo cột'                       # còn chữ "thế nào" không phải tên cột → vẫn tìm như cũ
    assert _ask('kế hoạch', {**SPEC, 'fields': ['plan']})['so_du_an'] == 2

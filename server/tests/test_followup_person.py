"""Câu nối tiếp nhắc lại người hoặc chỉnh lệnh sửa: "cô ấy" là người vừa hỏi, "thôi bỏ I.A.1.1 ra" là sửa lại đề xuất."""
from server.app.ai.agent import qa

ROWS = qa._clean_rows([
    {'code': 'I.A.1.1', 'name': 'Dự án A', 'pic': 'Bùi Thanh Hằng', 'progress': 'Chậm tiến độ'},
    {'code': 'I.A.2.1', 'name': 'Dự án B', 'pic': 'Nguyễn Văn An', 'progress': 'Đúng tiến độ'},
    {'code': 'II.A.1.1', 'name': 'Dự án C', 'pic': 'Bùi Thanh Hằng', 'progress': 'Đúng tiến độ'},
])
ASKED_HANG = [{'q': 'Bùi Thanh Hằng phụ trách những dự án nào?', 'codes': ['I.A.1.1', 'II.A.1.1'], 'a': 'Bùi Thanh Hằng phụ trách 2 dự án.'}]


def test_pronoun_becomes_the_person_just_asked_about():
    for q in ('cô ấy có dự án nào chậm không', 'co ay co du an nao cham khong', 'người đó phụ trách mấy dự án', 'chị ta còn dự án nào'):
        got, who = qa.resolve_person(q, ROWS, ASKED_HANG)
        assert who == 'Bùi Thanh Hằng' and qa._pic_in_question(got, ROWS) == 'Bùi Thanh Hằng', q


def test_person_named_only_in_the_previous_answer():
    hist = [{'q': 'Ai phụ trách I.A.2.1?', 'codes': ['I.A.2.1'], 'a': 'Dự án I.A.2.1 do Nguyễn Văn An phụ trách.'}]
    assert qa.resolve_person('anh ấy còn dự án nào khác', ROWS, hist)[1] == 'Nguyễn Văn An'


def test_most_recent_turn_with_a_person_wins_and_two_people_are_not_guessed():
    hist = [*ASKED_HANG, {'q': 'Nguyễn Văn An có mấy dự án?', 'codes': ['I.A.2.1'], 'a': '1 dự án.'}]
    assert qa.resolve_person('anh ấy có dự án nào chậm', ROWS, hist)[1] == 'Nguyễn Văn An'
    both = [{'q': 'So sánh Bùi Thanh Hằng và Nguyễn Văn An', 'codes': [], 'a': ''}]
    assert qa.resolve_person('cô ấy có dự án nào chậm', ROWS, both) == ('cô ấy có dự án nào chậm', '')


def test_no_change_without_pronoun_or_history():
    assert qa.resolve_person('dự án nào chậm', ROWS, ASKED_HANG)[1] == ''
    assert qa.resolve_person('cô ấy có dự án nào chậm', ROWS, [])[1] == ''
    assert qa.resolve_person('cố ý bỏ qua', ROWS, ASKED_HANG)[1] == ''
    assert qa.resolve_person('co y bo qua', ROWS, ASKED_HANG)[1] == ''


def test_mock_route_uses_the_resolved_person():
    got = qa.ask('cô ấy có những dự án nào', [dict(r) for r in ROWS], history=ASKED_HANG)
    assert set(got['codes']) == {'I.A.1.1', 'II.A.1.1'}


H_EDIT = [{'q': 'mấy dự án trễ thì ghi note chờ họp', 'codes': ['I.A.1.1', 'I.A.2.1', 'II.A.1.1'], 'a': 'Mình đã soạn 3 thay đổi'}]


def test_removing_a_project_from_a_proposed_edit_is_an_edit():
    for q in ('thôi bỏ I.A.1.1 ra', 'bỏ I.A.1.1 ra nhé', 'loại dự án I.A.2.1 ra', 'không sửa I.A.1.1 nữa'):
        assert qa.edit_follow_up(q, ROWS, H_EDIT) == {'query': 'edit', 'field': '', 'value': ''}, q
    assert qa.route('thôi bỏ I.A.1.1 ra', ROWS, {}, H_EDIT)[0]['query'] == 'edit'


def test_remove_words_without_a_pending_edit_are_left_to_the_ai():
    asked = [{'q': 'dự án nào đang chậm tiến độ', 'codes': ['I.A.1.1'], 'a': '1 dự án chậm tiến độ'}]
    assert qa.edit_follow_up('thôi bỏ I.A.1.1 ra', ROWS, asked) is None
    assert qa.edit_follow_up('I.A.1.1 có vấn đề gì', ROWS, H_EDIT) is None

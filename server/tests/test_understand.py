"""Hiểu cách người dùng gọi tên các thứ trong file: tên gọi tắt, xưng hô, gõ không dấu, "bước 10", "ưu tiên cao"; trùng tên thì hỏi lại."""
from server.app.ai.agent import qa
from server.app.ai.agent import understand as U

PICS = ['Bùi Thanh Hằng', 'Hoàng Gia Bảo', 'Trần Quốc Bảo', 'Lê Ngọc Anh', 'Hoàng Nhật Minh', 'Đặng Quốc Việt', 'Nguyễn Minh Đức']
ROWS = qa._clean_rows([{'code': f'I.A.{i}.1', 'name': f'Dự án {i}', 'pic': p, 'priority': 'High' if i % 2 else 'Low',
                        'step': '10.Đánh giá An ninh Bảo mật (ANBM)' if i < 3 else '3.Thiết kế', 'progress': 'Đúng tiến độ'}
                       for i, p in enumerate(PICS, 1)])


def _q(q, hist=()):
    return U.resolve(q, ROWS, list(hist))


def test_short_names_become_full_names_and_are_reported():
    for q, full in [('Hằng phụ trách gì', 'Bùi Thanh Hằng'), ('chị Hằng có mấy dự án', 'Bùi Thanh Hằng'), ('chi hang co may du an', 'Bùi Thanh Hằng'),
                    ('thanh hang co du an nao cham', 'Bùi Thanh Hằng'), ('gia bao làm gì', 'Hoàng Gia Bảo'), ('chị Anh có dự án nào', 'Lê Ngọc Anh'),
                    ('Minh có mấy dự án', 'Hoàng Nhật Minh'), ('Đức có dự án nào', 'Nguyễn Minh Đức'), ('anh viet co du an nao', 'Đặng Quốc Việt')]:
        r = _q(q)
        assert full in r['question'] and r['notes'][0]['gia_tri'] == full and not r['hoi_lai'], q
    assert U.note_text(_q('chị Hằng có mấy dự án')['notes']) == 'Mình hiểu "chị Hằng" là Bùi Thanh Hằng.'


def test_ordinary_words_are_not_names():
    for q in ('hằng tuần họp mấy lần', 'mình muốn xem dự án chậm', 'báo cáo tiếng Việt', 'Có bao nhiêu dự án', 'co bao nhieu du an',
              'Anh có mấy dự án', 'nước Đức', 'anh ấy làm gì'):
        r = _q(q)
        assert r['question'] == q and not r['notes'] and not r['hoi_lai'], q


def test_name_shared_by_two_people_asks_back_with_choices():
    r = _q('Bảo có mấy dự án')
    assert r['hoi_lai'] and r['hoi_lai']['lua_chon'] == ['Hoàng Gia Bảo có mấy dự án', 'Trần Quốc Bảo có mấy dự án']
    got = qa.ask('Bảo có mấy dự án', [dict(x) for x in ROWS])
    assert got['facts']['kieu'] == 'hoi_lai' and 'Bạn hỏi về ai' in got['answer']


def test_pronoun_uses_short_name_from_previous_question():
    r = _q('cô ấy có dự án nào chậm', [{'q': 'Hằng phụ trách những dự án nào?', 'codes': [], 'a': ''}])
    assert r['question'] == 'Bùi Thanh Hằng có dự án nào chậm'


def test_column_values_called_another_way():
    assert _q('Có bao nhiêu dự án ưu tiên cao')['question'] == 'Có bao nhiêu dự án ưu tiên High'
    assert _q('co bao nhieu du an uu tien thap')['question'] == 'co bao nhieu du an uu tien Low'
    assert _q('dự án nào đang ở bước 10')['question'] == 'dự án nào đang ở bước 10.Đánh giá An ninh Bảo mật (ANBM)'
    assert _q('bước 7 có gì')['question'] == 'bước 7 có gì'          # không có bước 7 trong file: để nguyên


def test_ask_prefixes_what_was_understood():
    got = qa.ask('Hằng phụ trách những dự án nào', [dict(x) for x in ROWS])
    assert got['answer'].startswith('Mình hiểu "Hằng" là Bùi Thanh Hằng.') and got['codes'] == ['I.A.1.1']
    assert got['understood'][0]['gia_tri'] == 'Bùi Thanh Hằng'

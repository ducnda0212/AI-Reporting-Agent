"""Tách dữ liệu tuần theo quy tắc (không AI)."""
from datetime import date

from app.ai import weekly as W

WEEK = {'key': 'w3', 'start': '2026-11-15', 'end': '2026-11-22'}
S, E = date(2026, 11, 15), date(2026, 11, 22)
REPORT = {'date': '2026-11-18', 'done': 'Hoàn thiện API', 'plan': 'Chạy UAT'}

RISK_NOTES = (
    '||*STT*||*Date*||*Mô tả issue/risk*||*Todo*||*PIC*||*Deadline*||\n'
    '|1|{{2026-11-17}}|Thiếu GPU cho huấn luyện|Mượn GPU team B|Tech Lead|20/11|\n'
    '|2|{{2026-11-18}}|Đối tác chậm trả API| | | |\n'
    '|3|{{2026-11-03}}|Rủi ro tuần trước|Đã xử lý| | |\n'
    '|4| |Không có ngày| | | |\n'
)
COMMENT_RAW = (
    '07/Oct/26 5:09 PM;712020:abc;{{2026-10-07}} \n\nRisk: Nhân sự SA cũ\n'
    '18/Nov/26 9:00 AM;712020:def;{{2026-11-18}} \n\nRisk: Thiếu SA viết L1\n\n→ chậm phía team AI\nĐề xuất: Mượn SA từ khối 2\n'
)


def test_parse_dates():
    assert W.parse_date('{{2026-11-17}}') == date(2026, 11, 17)
    assert W.parse_date('18/Nov/26 9:00 AM') == date(2026, 11, 18)
    assert W.parse_date('20/11/2026') == date(2026, 11, 20)
    assert W.parse_date('31/02/2026') is None and W.parse_date('') is None and W.parse_date('abc') is None


def test_wiki_table_keeps_link_pipes_and_multiline_cells():
    h, rows = W.parse_wiki_table('||Week||Tiến độ||Kế hoạch||\n|{{2026-11-18}}|* Xong [tài liệu|https://x/y]\n* Còn A|* Làm B|\n')
    assert h == ['Week', 'Tiến độ', 'Kế hoạch']
    assert rows == [['{{2026-11-18}}', '* Xong [tài liệu|https://x/y]\n* Còn A', '* Làm B']]
    assert W.parse_wiki_table('') == ([], []) and W.parse_wiki_table('không phải bảng') == ([], [])


def test_risk_notes_in_week_only_and_counts_undated():
    items, undated = W.risk_notes(RISK_NOTES, S, E)
    assert [i.risk for i in items] == ['Thiếu GPU cho huấn luyện', 'Đối tác chậm trả API']
    assert items[0].todo == 'Mượn GPU team B' and items[0].pic == 'Tech Lead' and items[0].deadline == '20/11'
    assert undated == 1
    assert items[0].line() == 'Rủi ro: Thiếu GPU cho huấn luyện\n→ Đề xuất: Mượn GPU team B (Tech Lead, hạn 20/11)'
    assert items[1].line() == 'Rủi ro: Đối tác chậm trả API'


def test_comments_dated_filtered_by_week():
    items, loose = W.comments(COMMENT_RAW, S, E)
    assert not loose and len(items) == 1
    assert items[0].risk == 'Thiếu SA viết L1; chậm phía team AI' and items[0].todo == 'Mượn SA từ khối 2'


def test_comments_cleaned_text_without_date_is_kept_and_flagged():
    items, loose = W.comments('Risk: Thiếu SA dedicate giai đoạn này', S, E)
    assert loose and items[0].risk == 'Thiếu SA dedicate giai đoạn này' and not items[0].todo
    assert W.comments('Đã họp với PO, mọi việc ổn', S, E) == ([], False)


def test_plan_full_data_needs_no_ai():
    rn = '||Date||Mô tả issue/risk||Todo||\n|{{2026-11-17}}|Thiếu GPU|Mượn GPU team B|\n'
    p = W.plan_week({'week': WEEK, 'riskNotes': rn, 'weekReport': REPORT})
    assert p.need == 'none' and p.source == 'Risk Notes' and p.text == 'Rủi ro: Thiếu GPU\n→ Đề xuất: Mượn GPU team B'


def test_plan_missing_action_asks_ai_for_action_only():
    p = W.plan_week({'week': WEEK, 'riskNotes': RISK_NOTES, 'weekReport': REPORT})
    assert p.need == 'action' and len(p.items) == 2 and p.notes == ['1 dòng Risk Notes không có ngày — chưa đưa vào, cần rà']


def test_plan_falls_back_to_comment_when_no_risk_notes():
    p = W.plan_week({'week': WEEK, 'riskNotes': '||Date||Mô tả issue/risk||\n| | |\n', 'commentRaw': COMMENT_RAW, 'weekReport': REPORT})
    assert p.source == 'Comment' and p.need == 'none'


def test_plan_signals_or_late_ask_ai_to_detect():
    p = W.plan_week({'week': WEEK, 'weekReport': {'done': '- Xong API\n- Đang chờ GPU từ hạ tầng', 'plan': ''}})
    assert p.need == 'full' and p.text == '' and p.evidence == ['Đang chờ GPU từ hạ tầng']
    assert W.plan_week({'week': WEEK, 'weekReport': REPORT, 'late': True}).need == 'full'


def test_plan_quiet_or_no_report():
    p = W.plan_week({'week': WEEK, 'weekReport': REPORT})
    assert p.need == 'none' and p.text == W.NO_ISSUE
    p = W.plan_week({'week': WEEK})
    assert p.need == 'none' and p.text == W.NO_REPORT


def test_rule_risk_level():
    late = {'late': True, 'weekReport': REPORT}
    assert W.rule_risk_level(late, W.plan_week({'week': WEEK, **late}))['text'] == 'Cao'
    row = {'week': WEEK, 'riskNotes': RISK_NOTES, 'weekReport': REPORT}
    assert W.rule_risk_level(row, W.plan_week(row))['text'] == 'Trung bình'
    assert W.rule_risk_level({'week': WEEK}, W.plan_week({'week': WEEK}))['text'] == 'Trung bình'
    row = {'week': WEEK, 'weekReport': REPORT}
    assert W.rule_risk_level(row, W.plan_week(row)) == {'text': 'Thấp', 'why': 'Đúng tiến độ, không ghi nhận rủi ro trong tuần', 'by': 'rule'}

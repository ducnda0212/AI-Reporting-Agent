"""Kiểm thử qua HTTP: API thật (uvicorn) + V-LLM giả."""
import io


def multipart(name, content):
    b = '----x'
    body = (f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + content + f'\r\n--{b}--\r\n'.encode()
    return body, f'multipart/form-data; boundary={b}'


def test_health_and_status(api):
    s, d = api('/api/health')
    assert s == 200 and d['mode'] == 'vllm'
    s, d = api('/api/ai/status')
    assert d['auth'] == 'oauth' and d['host'] == '127.0.0.1:9555' and d['problems'] == []
    assert 'secret' not in str(d)  # không lộ khoá


def test_ping_refreshes_expired_token(api, fake):
    s, d = api('/api/ai/ping', {})
    assert s == 200 and d['reply'] == 'OK', d
    body = fake['bodies'][-1]
    assert body['chat_template_kwargs'] == {'enable_thinking': False} and body['guardrail'] == 'low'


def test_ping_reports_vllm_error(api, fake):
    fake['status_queue'] = [404]
    s, d = api('/api/ai/ping', {})
    assert s == 502 and 'đường dẫn' in d['error']


def test_models(api):
    s, d = api('/api/ai/models')
    assert s == 200 and 'v-llm-v1-large' in d['models']


def test_draft_end_to_end_masks_names(api, fake):
    rows = [{'id': 7, 'code': 'I.A.5.1', 'task': 'Gợi ý món', 'late': True, 'people': ['Nguyễn Văn An'],
             'week': {'key': 'w3', 'start': '2026-11-15', 'end': '2026-11-22'},
             'weekReport': {'date': '2026-11-18', 'done': 'Xong API\nĐang chờ GPU, anh Nguyễn Văn An đang hỏi hạ tầng', 'plan': 'Hoàn thiện API'}},
            {'id': 8, 'week': {'key': 'w3', 'start': '2026-11-15', 'end': '2026-11-22'},
             'weekReport': {'date': '2026-11-18', 'done': 'Xong API', 'plan': 'UAT'}}]
    n0 = len(fake['bodies'])
    s, d = api('/api/ai/draft', {'rows': rows})
    assert s == 200 and d['errors'] == {} and d['aiCalls'] == 1 and len(fake['bodies']) == n0 + 1   # dòng 8 đủ dữ liệu → không gọi AI
    iss = d['drafts']['7']['issues']
    assert iss['need'] == 'full' and 'Nguyễn Văn An' in iss['suggestion']['text'] and d['drafts']['7']['riskLevel']['text'] == 'Cao'
    assert d['drafts']['8']['issues']['text'] == 'Không có vấn đề phát sinh trong tuần.'
    sent = fake['bodies'][-1]['messages'][-1]['content']
    assert 'Nguyễn Văn An' not in sent and '[Người 1]' in sent


def test_draft_falls_back_when_schema_unsupported(api, fake):
    fake['reject_schema'] = True
    row = {'id': 1, 'week': {'start': '2026-11-15', 'end': '2026-11-22'}, 'weekReport': {'done': 'Đang chờ GPU', 'plan': 'b'}}
    s, d = api('/api/ai/draft', {'rows': [row]})
    assert s == 200 and d['drafts']['1']['issues']['suggestion']['text']
    assert fake['bodies'][-1]['response_format']['type'] == 'json_object'


def test_draft_validation(api):
    assert api('/api/ai/draft', {})[0] == 400
    assert api('/api/ai/draft', {'rows': []})[0] == 400
    assert api('/api/ai/draft', {'rows': [{'id': i} for i in range(61)]})[0] == 400
    assert api('/api/ai/draft', raw=b'not json')[0] == 400


def test_risk_assess(api):
    s, d = api('/api/risk/assess', {'text': 'Mốc UAT lùi lần 2', 'context': {'daysToDue': 3, 'weeksOpen': 2}})
    assert s == 200 and d['score']['priority'] == 'P2' and d['score']['color'] == 'Đỏ'
    assert d['standardAction'].startswith('Replan mốc')
    assert api('/api/risk/assess', {'text': '  '})[0] == 400


def test_import_csv_xlsx_and_rejects_non_jira(api):
    csv_text = ('Summary,Issue key,Status,Labels,Labels,Custom field (Progress Report),Comment,Comment,Empty\n'
                'I.A.5.1 Gợi ý món,AI-1,In Progress,ai,,"18/11: xong A",c1,c2,\n'
                'Không mã,AI-2,Done,,,,,,\n')
    body, ct = multipart('jira.csv', csv_text.encode('utf-8-sig'))
    s, d = api('/api/import', raw=body, ctype=ct)
    assert s == 200 and d['issues'] == 2 and d['dupGroups'] == 2 and d['projects'] == 1 and d['noCode'] == ['AI-2']
    from openpyxl import Workbook
    wb = Workbook()
    wb.active.append(['Issue key', 'Summary', 'Status'])
    wb.active.append(['AI-9', 'II.E.1.2 Định giá', 'To Do'])
    buf = io.BytesIO()
    wb.save(buf)
    body, ct = multipart('jira.xlsx', buf.getvalue())
    s, d = api('/api/import', raw=body, ctype=ct)
    assert s == 200 and d['items'][0]['code'] == 'II.E.1.2'
    body, ct = multipart('x.csv', b'a,b\n1,2\n')
    s, d = api('/api/import', raw=body, ctype=ct)
    assert s == 400 and 'Jira' in d['error']


def test_agent_ask_end_to_end(api, fake):
    rows = [{'code': 'DA01', 'name': 'Gợi ý món', 'progress': 'Chậm tiến độ', 'risk': 'Cao', 'pic': 'Nguyễn Văn An'},
            {'code': 'DA02', 'name': 'Chấm điểm', 'progress': 'Đúng tiến độ', 'risk': 'Thấp', 'pic': 'Trần Thị Bình'}]
    n0 = len(fake['bodies'])
    s, d = api('/api/agent/ask', {'question': 'Dự án nào đang chậm?', 'rows': rows})
    assert s == 200, d
    assert d['grounded'] and d['codes'] == ['DA01'] and d['facts']['so_luong'] == 1 and len(fake['bodies']) == n0 + 2   # V-LLM đọc ý định rồi mới diễn đạt
    assert all('Nguyễn Văn An' not in b['messages'][-1]['content'] for b in fake['bodies'][n0:])
    fake['agent_text'] = 'Có 9 dự án chậm.'          # AI nói sai số lượng → dùng câu mẫu theo số liệu
    s, d = api('/api/agent/ask', {'question': 'Dự án nào đang chậm?', 'rows': rows})
    assert s == 200 and not d['grounded'] and d['answer'].startswith('Có 1/2 dự án')


def test_agent_ask_validation(api):
    assert api('/api/agent/ask', {'rows': [{'code': 'A'}]})[0] == 400
    assert api('/api/agent/ask', {'question': 'x'})[0] == 400
    assert api('/api/agent/ask', {'question': 'x' * 501, 'rows': [{'code': 'A'}]})[0] == 400
    assert api('/api/agent/ask', {'question': 'x', 'rows': [{'code': str(i)} for i in range(301)]})[0] == 400


def test_agent_edit_end_to_end_never_applies(api, fake):
    fields = [{'id': 'rui', 'name': 'Mức độ rủi ro', 'options': ['Cao', 'Trung bình', 'Thấp']}, {'id': 'mang', 'name': 'Nhóm', 'options': ['Food', 'Voice']}]
    rows = [{'code': 'DA01', 'pic': 'Nguyễn Văn An', 'values': {'rui': '', 'mang': 'Food'}},
            {'code': 'DA02', 'values': {'rui': 'Cao', 'mang': 'Food'}}, {'code': 'DA03', 'values': {'rui': '', 'mang': 'Voice'}}]
    s, d = api('/api/agent/ask', {'question': 'Điền mức rủi ro trung bình cho dự án Food còn trống', 'rows': rows, 'fields': fields})
    assert s == 200, d
    assert d['intent'] == 'edit' and d['applied'] is False and [(p['code'], p['to']) for p in d['proposals']] == [('DA01', 'Trung bình')]

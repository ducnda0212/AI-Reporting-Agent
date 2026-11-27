"""Máy chủ V-LLM giả để kiểm thử: OAuth token, /models, /chat/completions (chuẩn OpenAI)."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {'embed_calls': 0, 'embed_inputs': [], 'embed_status': None, 'tokens': 0, 'calls': 0, 'reject_first_token': True, 'bodies': [], 'reject_schema': False, 'status_queue': [], 'reply': None}


def _answer(body):
    rf = body.get('response_format') or {}
    name = (rf.get('json_schema') or {}).get('name', '')
    user = body['messages'][-1]['content']
    if name == 'week_suggestion' or 'Dữ liệu dự án tuần này' in user:
        p = json.loads(user.split('\n', 1)[1])
        if p['kieu'] == 'goi_y_de_xuat':
            items = [{'risk': r, 'action': 'Hẹn [Người 1] chốt ETA với đối tác', 'owner': 'PM', 'due': '', 'category': 'C7', 'why': 'Risk Notes chưa có Todo'}
                     for r in p['rui_ro_can_de_xuat']]
        elif p.get('cau_dau_hieu'):
            items = [{'risk': p['cau_dau_hieu'][0], 'action': 'Làm việc với hạ tầng để có GPU trước 25/11', 'owner': '', 'due': '25/11',
                      'category': 'C6', 'why': 'Report ghi chờ GPU'}]
        else:
            items = []
        lv = 'Cao' if p['dang_cham'] else ('Trung bình' if items else 'Thấp')
        out = {'items': items, 'riskLevel': {'text': lv, 'why': 'theo dữ liệu tuần'}}
        return '<think>xem dữ liệu</think>```json\n' + json.dumps(out, ensure_ascii=False) + '\n```'
    if name == 'agent_edit' or 'Câu lệnh:' in user:
        return json.dumps({'ops': [{'field': 'rui', 'value': 'Trung bình', 'target': {'codes': [], 'where_field': 'mang', 'where_value': 'Food',
                                                                                  'only_empty': True, 'all': False}}], 'unclear': ''}, ensure_ascii=False)
    if name == 'agent_route' or 'Giá trị hiện có trong bảng' in user:
        q = user.split('Câu của người dùng:', 1)[-1].strip().lower()
        if q.startswith(('điền', 'đổi', 'sửa', 'ghi', 'chuyển')):
            spec = {'query': 'edit'}
        elif 'chờ gpu' in q:
            spec = {'query': 'search', 'field': '', 'value': ''}
        elif 'chậm' in q:
            spec = {'query': 'filter', 'field': 'tien_do', 'value': 'chậm'}
        else:
            spec = {'query': 'summary', 'field': '', 'value': ''}
        return json.dumps(spec, ensure_ascii=False)
    if name == 'agent_answer' or 'so_lieu:' in user:
        facts = json.loads(user.split('so_lieu:\n', 1)[1])
        du = facts.get('du_an') or []
        codes = [x['code'] for x in (du if isinstance(du, list) else [du]) if isinstance(x, dict)]
        text = STATE.get('agent_text') or (f"Có {facts.get('so_luong', facts.get('tong'))} dự án: " + ', '.join(codes[:6]) + '.')
        return json.dumps({'answer': text, 'codes': STATE.get('agent_codes') or codes[:6]}, ensure_ascii=False)
    if name == 'risk_assessment' or 'Vấn đề cần đánh giá' in user:
        return json.dumps({'kind': 'Issue', 'probability': '', 'category': 'C3', 'why': 'Chậm nội bộ', 'delayDays': 12, 'financePct': 0,
                           'contract': 0, 'quality': 0, 'dataControl': 0, 'blocked': False, 'noOwner': False,
                           'signals': [{'code': 'R03', 'note': 'Hạn đổi 2 lần'}], 'actions': [{'text': 'Replan mốc UAT', 'owner': 'PM', 'due': '21/11'}],
                           'closeWhen': 'KH xác nhận mốc mới', 'confidence': 'high', 'uncertainty': '', 'alternativeCategory': '', 'missingInfo': []},
                          ensure_ascii=False)
    return 'OK'


_ALIAS = {'card': 'gpu', 'hoa': 'gpu', 'thieu': 'cho'}  # "đồng nghĩa" giả để thử tìm theo nghĩa


def _embed(text, dim=64):
    """Vector giả: đếm từ (bỏ dấu, quy đồng nghĩa giả) vào 64 ô. Đủ để thử trộn xếp hạng, không phải mô hình thật."""
    import re
    import unicodedata
    import zlib
    t = unicodedata.normalize('NFD', text.lower().replace('đ', 'd'))
    toks = re.findall(r'[a-z0-9]+', ''.join(c for c in t if unicodedata.category(c) != 'Mn'))
    v = [0.0] * dim
    for w in toks:
        v[zlib.crc32(_ALIAS.get(w, w).encode()) % dim] += 1.0
    return v


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _auth_ok(self):
        return self.headers.get('Authorization', '').startswith('Bearer tok-')

    def do_GET(self):
        if self.path.endswith('/v1/models'):
            if not self._auth_ok():
                return self._send(401, {'error': 'unauthorized'})
            return self._send(200, {'data': [{'id': 'v-llm-v1-large'}, {'id': 'v-llm-v1-medium'}]})
        self._send(404, {})

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if self.path.endswith('/v1/audio/transcriptions'):  # multipart: không đọc như JSON
            if not self._auth_ok():
                return self._send(401, {'error': 'unauthorized'})
            STATE['asr_calls'] = STATE.get('asr_calls', 0) + 1
            STATE['asr_raw'] = raw
            return self._send(200, {'text': STATE.get('asr_text') or 'cho i chấm a chấm một chấm một rủi ro cao', 'language': 'vi', 'duration': 2.5})
        body = json.loads(raw or b'{}')
        if self.path.endswith('/oauth/token'):
            if body.get('client_secret') != 'secret':
                return self._send(401, {'error': 'bad secret'})
            STATE['tokens'] += 1
            return self._send(200, {'access_token': f"tok-{STATE['tokens']}", 'token_type': 'bearer', 'expires_in': 7884000})
        if self.path.endswith('/v1/embeddings'):
            if not self._auth_ok():
                return self._send(401, {'error': 'unauthorized'})
            STATE['embed_calls'] += 1
            STATE['embed_inputs'].extend(body['input'])
            if STATE['embed_status']:
                return self._send(STATE['embed_status'], {'error': 'embedding failure'})
            return self._send(200, {'model': body.get('model'), 'data': [{'index': i, 'embedding': _embed(t)} for i, t in reversed(list(enumerate(body['input'])))]})
        if self.path.endswith('/v1/chat/completions'):
            STATE['calls'] += 1
            STATE['bodies'].append(body)
            if not self._auth_ok():
                return self._send(401, {'error': 'unauthorized'})
            if STATE['reject_first_token'] and self.headers['Authorization'] == 'Bearer tok-1':
                STATE['reject_first_token'] = False
                return self._send(401, {'error': 'expired'})
            if STATE['status_queue']:
                return self._send(STATE['status_queue'].pop(0), {'error': 'queued failure'})
            if STATE['reject_schema'] and (body.get('response_format') or {}).get('type') == 'json_schema':
                return self._send(400, {'error': {'message': 'response_format json_schema not supported'}})
            return self._send(200, {'model': body.get('model'), 'choices': [{'message': {'role': 'assistant', 'content': STATE['reply'] if STATE['reply'] is not None else _answer(body)}, 'finish_reason': 'stop'}],
                                    'usage': {'prompt_tokens': 10, 'completion_tokens': 5}})
        self._send(404, {})


def start(port=9555):
    srv = ThreadingHTTPServer(('127.0.0.1', port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

"""Client gọi V-LLM theo chuẩn OpenAI (/v1/chat/completions).

- Xác thực: API key cố định, hoặc OAuth2 client credentials (tự lấy và làm mới token).
- Tắt "suy nghĩ" (chat_template_kwargs.enable_thinking) để trả lời nhanh, JSON sạch.
- Ép JSON theo schema; nếu nền tảng không nhận schema thì tự hạ xuống json_object rồi prompt.
- Thử lại khi 429/5xx/hết giờ; làm mới token một lần khi 401.
Dùng thư viện chuẩn (urllib) để không phụ thuộc thêm gói.
"""
from __future__ import annotations

import json
import re
import ssl
import threading
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

from .settings import Settings, settings as default_settings


class VllmError(Exception):
    def __init__(self, message: str, status: int | None = None, detail: str = ''):
        super().__init__(message)
        self.status = status
        self.detail = detail


class VllmClient:
    def __init__(self, cfg: Settings | None = None):
        self.cfg = cfg or default_settings
        self._token = ''
        self._token_exp = 0.0
        self._lock = threading.Lock()
        self._json_mode = self.cfg.json_mode
        self.backoff = 1.5  # giây chờ giữa các lần thử lại

    # ---------- mạng ----------
    def _ssl(self):
        if self.cfg.insecure:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            return ctx
        if self.cfg.ca_bundle:
            return ssl.create_default_context(cafile=self.cfg.ca_bundle)
        return None

    def _http(self, method: str, url: str, body: dict | None = None, headers: dict | None = None, timeout: float | None = None):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header('Content-Type', 'application/json')
        req.add_header('Accept', 'application/json')
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.cfg.timeout, context=self._ssl()) as res:
                raw = res.read().decode('utf-8', 'replace')
                return res.status, raw
        except urllib.error.HTTPError as e:
            raw = e.read().decode('utf-8', 'replace') if e.fp else ''
            return e.code, raw
        except urllib.error.URLError as e:
            reason = getattr(e, 'reason', e)
            if isinstance(reason, ssl.SSLError) or 'CERTIFICATE' in str(reason).upper():
                raise VllmError('Lỗi chứng chỉ HTTPS khi gọi V-LLM. Đặt VLLM_CA_BUNDLE trỏ tới file CA của công ty.', None, str(reason))
            raise VllmError(f'Không kết nối được V-LLM ({reason}). Kiểm tra mạng nội bộ/VPN và VLLM_BASE_URL.', None, str(reason))
        except TimeoutError as e:
            raise VllmError('V-LLM trả lời quá lâu (hết giờ chờ).', None, str(e))

    # ---------- xác thực ----------
    def _get_token(self, force: bool = False) -> str:
        if self.cfg.api_key:
            return self.cfg.api_key
        if self.cfg.auth_kind != 'oauth':
            raise VllmError('Chưa cấu hình VLLM_API_KEY hoặc OAuth (VLLM_AUTH_URL, VLLM_CLIENT_ID, VLLM_CLIENT_SECRET).')
        with self._lock:
            if not force and self._token and time.time() < self._token_exp:
                return self._token
            body = {'client_id': self.cfg.client_id, 'client_secret': self.cfg.client_secret}
            if self.cfg.project_id:
                body['project_id'] = self.cfg.project_id
            status, raw = self._http('POST', self.cfg.auth_url, body, timeout=30)
            if status != 200:
                raise VllmError(f'Lấy token V-LLM thất bại (HTTP {status}). Kiểm tra client_id/secret/project_id.', status, raw[:300])
            try:
                d = json.loads(raw)
                tok = d['access_token']
            except (ValueError, KeyError):
                raise VllmError('Phản hồi lấy token không có access_token.', status, raw[:300])
            exp = float(d.get('expires_in') or 3600)
            self._token = tok
            self._token_exp = time.time() + max(60.0, exp - 300)
            return tok

    def _auth_headers(self, force: bool = False) -> dict:
        return {'Authorization': f'Bearer {self._get_token(force)}'}

    # ---------- API ----------
    def models(self) -> list[str]:
        status, raw = self._http('GET', f'{self.cfg.base_url}/models', headers=self._auth_headers(), timeout=30)
        if status == 401 and self.cfg.auth_kind == 'oauth':
            status, raw = self._http('GET', f'{self.cfg.base_url}/models', headers=self._auth_headers(True), timeout=30)
        if status != 200:
            raise VllmError(f'Không lấy được danh sách model (HTTP {status}).', status, raw[:300])
        try:
            return [m.get('id') for m in json.loads(raw).get('data', []) if m.get('id')]
        except ValueError:
            raise VllmError('Danh sách model không phải JSON.', status, raw[:300])

    def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        """/v1/embeddings (chuẩn OpenAI). Trả một vector cho mỗi chuỗi, đúng thứ tự."""
        if not texts:
            return []
        body = {'model': model or self.cfg.embed_model, 'input': texts}
        if not body['model']:
            raise VllmError('Chưa đặt AI_EMBED_MODEL.')
        ext = bool(self.cfg.embed_base_url)   # dịch vụ embeddings RIÊNG (vd OpenAI): khoá riêng, không dùng token V-LLM
        url = f'{self.cfg.embed_base_url or self.cfg.base_url}/embeddings'
        last: VllmError | None = None
        refreshed = False
        for attempt in range(3):
            heads = {'Authorization': 'Bearer ' + self.cfg.embed_api_key} if ext else self._auth_headers()
            status, raw = self._http('POST', url, body, headers=heads)
            if status == 200:
                try:
                    data = sorted(json.loads(raw)['data'], key=lambda d: d.get('index', 0))
                    vecs = [[float(x) for x in d['embedding']] for d in data]
                except (ValueError, KeyError, TypeError):
                    raise VllmError('Phản hồi embeddings không đúng định dạng OpenAI.', status, raw[:300])
                if len(vecs) != len(texts):
                    raise VllmError('Số vector embeddings không khớp số đoạn gửi.', status, raw[:300])
                return vecs
            if status == 401 and not ext and self.cfg.auth_kind == 'oauth' and not refreshed:
                self._get_token(force=True)
                refreshed = True
                continue
            last = VllmError(self._err(status, 'AI_EMBED_API_KEY' if ext else 'OPENAI_API_KEY') if (ext or self.openai) else _http_message(status), status, raw[:500])
            if status in (429, 500, 502, 503, 504):
                time.sleep(self.backoff * (attempt + 1))
                continue
            raise last
        raise last or VllmError('Gọi embeddings thất bại.')

    def transcribe(self, audio: bytes, filename: str = 'speech.wav', content_type: str = 'audio/wav', language: str = 'vi', model: str | None = None) -> dict:
        """/v1/audio/transcriptions (chuẩn OpenAI, multipart). Trả {'text', 'language', 'duration'}."""
        if not audio:
            raise VllmError('Không có âm thanh để nhận dạng.')
        boundary = 'pmo' + uuid.uuid4().hex
        parts: list[bytes] = []

        def field(name: str, value: str) -> None:
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode('utf-8'))
        ext = bool(self.cfg.asr_base_url)  # dịch vụ giọng nói riêng (vd Blaze): xác thực bằng khoá riêng, không gửi kèm response_format
        field('model', model or self.cfg.asr_model)
        if language:
            field('language', language)
        if not ext:
            field('response_format', 'json')
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', filename)[:60] or 'speech.wav'
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe}"\r\nContent-Type: {content_type}\r\n\r\n'.encode('utf-8') + audio + b'\r\n')
        parts.append(f'--{boundary}--\r\n'.encode('utf-8'))
        data = b''.join(parts)
        base = self.cfg.asr_base_url or self.cfg.base_url
        url = f'{base}/audio/transcriptions'
        who = 'dịch vụ giọng nói' if ext else 'V-LLM'
        refreshed = False
        for attempt in range(2):
            req = urllib.request.Request(url, data=data, method='POST')
            req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
            req.add_header('Accept', 'application/json')
            heads = {'Authorization': 'Bearer ' + self.cfg.asr_api_key} if ext and self.cfg.asr_api_key else self._auth_headers(force=refreshed)
            for k, v in heads.items():
                req.add_header(k, v)
            try:
                with urllib.request.urlopen(req, timeout=self.cfg.timeout, context=self._ssl()) as res:
                    status, raw = res.status, res.read().decode('utf-8', 'replace')
            except urllib.error.HTTPError as e:
                status, raw = e.code, e.read().decode('utf-8', 'replace') if e.fp else ''
            except urllib.error.URLError as e:
                raise VllmError(f'Không kết nối được {who} ({getattr(e, "reason", e)}).', None, str(e))
            except TimeoutError as e:
                raise VllmError('Nhận dạng giọng nói quá lâu (hết giờ chờ).', None, str(e))
            if status == 202 and ext:  # job chạy lâu hơn thời gian chờ: hỏi lại vài lần
                try:
                    jid = json.loads(raw).get('id')
                except ValueError:
                    jid = None
                for _ in range(10):
                    if not jid:
                        break
                    time.sleep(1.5)
                    st, rw = self._http('GET', f'{base}/audio/transcriptions/jobs/{jid}', headers=heads)
                    if st == 200 and json.loads(rw).get('status') == 'completed':
                        status, raw = 200, rw
                        break
                    if st != 200 or json.loads(rw).get('status') == 'failed':
                        break
            if status == 200:
                try:
                    d = json.loads(raw)
                except ValueError:
                    raise VllmError('Phản hồi nhận dạng giọng nói không phải JSON.', status, raw[:300])
                return {'text': str(d.get('text') or '').strip(), 'language': d.get('language') or language, 'duration': d.get('duration')}
            if status == 401 and self.cfg.auth_kind == 'oauth' and not refreshed:
                refreshed = True
                continue
            msg = _http_message(status) if status != 404 else f'Chưa có model nhận dạng giọng nói trên {who} (HTTP 404). Kiểm tra AI_ASR_MODEL và AI_ASR_BASE_URL.'
            raise VllmError(msg, status, raw[:500])
        raise VllmError('Nhận dạng giọng nói thất bại.')

    @staticmethod
    def _err(status: int, key: str) -> str:
        hint = {400: 'sai tên model hoặc tham số', 401: f'khoá {key} sai hoặc hết hạn', 403: 'khoá không có quyền dùng model này', 404: 'sai tên model hoặc đường dẫn',
                429: 'hết hạn mức hoặc gọi quá nhanh'}.get(status, '')
        return f'OpenAI báo lỗi HTTP {status}' + (f' ({hint}).' if hint else '.')

    @property
    def openai(self) -> bool:
        """Đang trỏ thẳng tới OpenAI (VLLM_BASE_URL=https://api.openai.com/v1): bỏ các tham số riêng của V-LLM, đổi tên tham số theo OpenAI."""
        return getattr(self.cfg, 'provider', '') == 'openai' or 'api.openai.com' in (self.cfg.base_url or '').lower()

    def _body(self, messages: list[dict], schema: dict | None, max_tokens: int | None, temperature: float, model: str | None = None) -> dict:
        name = model or self.cfg.model
        body: dict[str, Any] = {'model': name, 'messages': messages}
        if self.openai:
            reasoning = bool(re.match(r'(gpt-5|o\d)', name.lower()))   # dòng suy luận: không nhận temperature, tốn token cho phần nghĩ
            body['max_completion_tokens'] = (max_tokens or self.cfg.max_tokens) + (2048 if reasoning else 0)
            if reasoning:
                body['reasoning_effort'] = 'low'
            else:
                body['temperature'] = temperature
        else:
            body.update({'temperature': temperature, 'max_tokens': max_tokens or self.cfg.max_tokens,
                         'chat_template_kwargs': {'enable_thinking': self.cfg.thinking}})
            if self.cfg.guardrail:
                body['guardrail'] = self.cfg.guardrail
        if schema is not None:
            if self._json_mode == 'schema':
                sch = _strict_schema(schema) if self.openai else schema
                body['response_format'] = {'type': 'json_schema', 'json_schema': {'name': schema.get('title', 'result'), 'schema': sch, 'strict': True}}
            elif self._json_mode == 'object':
                body['response_format'] = {'type': 'json_object'}
        return body

    def chat(self, messages: list[dict], schema: dict | None = None, max_tokens: int | None = None, temperature: float = 0.2,
             model: str | None = None) -> dict:
        """Gọi chat completions, trả {'content', 'usage', 'model', 'ms'}."""
        url = f'{self.cfg.base_url}/chat/completions'
        t0 = time.time()
        last: VllmError | None = None
        refreshed = False
        for attempt in range(3):
            body = self._body(messages, schema, max_tokens, temperature, model)
            status, raw = self._http('POST', url, body, headers=self._auth_headers())
            if status == 200:
                try:
                    d = json.loads(raw)
                    msg = d['choices'][0]['message']
                except (ValueError, KeyError, IndexError):
                    raise VllmError('Phản hồi V-LLM không đúng định dạng OpenAI.', status, raw[:300])
                return {'content': msg.get('content') or '', 'usage': d.get('usage') or {}, 'model': d.get('model') or model or self.cfg.model,
                        'finish': d['choices'][0].get('finish_reason'), 'ms': int((time.time() - t0) * 1000)}
            if status == 401 and self.cfg.auth_kind == 'oauth' and not refreshed:
                self._get_token(force=True)
                refreshed = True
                continue
            if status == 400 and schema is not None and self._json_mode != 'none' and 'response_format' in raw.lower():
                # nền tảng không nhận kiểu ép JSON này: hạ một bậc rồi thử lại
                self._json_mode = 'object' if self._json_mode == 'schema' else 'none'
                continue
            last = VllmError(self._err(status, 'OPENAI_API_KEY') if self.openai else _http_message(status), status, raw[:500])
            if status in (429, 500, 502, 503, 504):
                time.sleep(self.backoff * (attempt + 1))
                continue
            raise last
        raise last or VllmError('Gọi V-LLM thất bại.')

    def chat_json(self, messages: list[dict], schema: dict, max_tokens: int | None = None, model: str | None = None,
                  repair: bool = False, temperature: float | None = None) -> dict:
        """Gọi và đọc JSON; nếu đọc không được thì nhắc lại một lần.
        repair=True: JSON bị cắt giữa chừng thì đóng ngoặc cho đủ (chỉ dùng khi code kiểm tra lại toàn bộ kết quả)."""
        kw = {} if temperature is None else {'temperature': temperature}   # temperature=0: cùng một câu hỏi thì V-LLM chọn cùng một cách (dùng cho bước đọc ý định)
        res = self.chat(messages, schema, max_tokens, model=model, **kw)
        try:
            return {**res, 'data': parse_json(res['content'], repair)}
        except ValueError:
            retry = messages + [{'role': 'assistant', 'content': res['content'][:2000]},
                                {'role': 'user', 'content': 'Câu trả lời trên không phải JSON hợp lệ. Chỉ trả về đúng một đối tượng JSON theo schema, không giải thích.'}]
            res2 = self.chat(retry, schema, max_tokens, model=model, **kw)
            try:
                return {**res2, 'data': parse_json(res2['content'], repair)}
            except ValueError:
                raise VllmError('V-LLM không trả về JSON hợp lệ.', 200, res2['content'][:500])


_STRICT_DROP = {'minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'format', 'default'}


def _strict_schema(node: Any) -> Any:
    """Schema theo chế độ strict của OpenAI: mọi thuộc tính phải nằm trong required, additionalProperties=false, bỏ các ràng buộc số/độ dài
    (code đã tự kiểm tra lại mọi kết quả AI nên không mất gì)."""
    if isinstance(node, list):
        return [_strict_schema(x) for x in node]
    if not isinstance(node, dict):
        return node
    out = {k: _strict_schema(v) for k, v in node.items() if k not in _STRICT_DROP}
    if out.get('type') == 'object' and isinstance(out.get('properties'), dict):
        out['additionalProperties'] = False
        out['required'] = list(out['properties'])
    return out


def _http_message(status: int) -> str:
    return {
        400: 'V-LLM từ chối yêu cầu (HTTP 400). Có thể sai tên model hoặc tham số.',
        401: 'Token V-LLM không hợp lệ hoặc đã hết hạn (HTTP 401).',
        403: 'Tài khoản không có quyền dùng model này (HTTP 403).',
        404: 'Sai đường dẫn V-LLM (HTTP 404). Kiểm tra VLLM_BASE_URL có /<tenant>/v1.',
        413: 'Nội dung gửi quá dài (HTTP 413).',
        429: 'V-LLM đang giới hạn số lần gọi (HTTP 429).',
    }.get(status, f'V-LLM báo lỗi HTTP {status}.')


_THINK = re.compile(r'<think>.*?</think>', re.S | re.I)


def repair_json(t: str) -> Any:
    """Đóng JSON bị cắt giữa chừng: đóng chuỗi, bỏ khoá/dấu phẩy treo, thêm ngoặc còn thiếu. Không được thì lùi về phần tử trọn vẹn trước đó."""
    start = t.find('{')
    if start < 0:
        raise ValueError('no json object')
    s = t[start:]
    for _ in range(40):
        stack, in_str, esc = [], False, False
        for ch in s:
            if in_str:
                if esc:
                    esc = False
                elif ch == '\\':
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch in '{[':
                stack.append('}' if ch == '{' else ']')
            elif ch in '}]' and stack:
                stack.pop()
        tail = s + ('"' if in_str else '')
        tail = re.sub(r'(,\s*"[^"]*"\s*:?\s*|,\s*|:\s*)$', '', tail)
        try:
            return json.loads(tail + ''.join(reversed(stack)))
        except ValueError:
            cut = max(s.rfind(','), s.rfind('{', 0, len(s) - 1), s.rfind('[', 0, len(s) - 1))
            if cut <= 0:
                break
            s = s[:cut] if s[cut] == ',' else s[:cut + 1]
    raise ValueError('unterminated json')


def parse_json(text: str, repair: bool = False) -> Any:
    """Đọc JSON từ câu trả lời: bỏ phần <think>, bỏ ```json, lấy đối tượng ngoài cùng."""
    t = _THINK.sub('', text or '').strip()
    t = re.sub(r'^```(?:json)?\s*|\s*```$', '', t.strip(), flags=re.I)
    try:
        return json.loads(t)
    except ValueError:
        pass
    start = t.find('{')
    if start < 0:
        raise ValueError('no json object')
    depth, in_str, esc = 0, False, False
    for i in range(start, len(t)):
        ch = t[i]
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return json.loads(t[start:i + 1])
    if repair:
        return repair_json(t)
    raise ValueError('unterminated json')


client = VllmClient()

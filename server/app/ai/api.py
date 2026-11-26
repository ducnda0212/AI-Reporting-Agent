"""Các route AI (Starlette thuần, không cần DB). Gắn vào app FastAPI bằng `mount(app)`; cũng chạy riêng được: `app` ở cuối file.

  GET  /api/health          trạng thái AI (chế độ, model)
  GET  /api/ai/status       cấu hình AI đang dùng (không lộ khoá)
  *    /api/ai/ping         gọi thử một câu ngắn tới V-LLM
  GET  /api/ai/models       danh sách model của V-LLM
  POST /api/ai/draft        gợi ý nháp cho các dòng báo cáo
  POST /api/risk/assess     đánh giá một rủi ro theo bộ tiêu chí
  POST /api/agent/ask       Agent hỏi đáp / đề xuất sửa ô (không tự ghi)
  POST /api/import          (cũ) đọc file Jira; đã được /api/v1/ingest/upload thay thế
"""
from __future__ import annotations

import time
from urllib.parse import urlparse

from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .. import jira_import
from . import agent, drafts, risk
from .llm import VllmError, client
from .settings import settings

MAX_UPLOAD = 30 * 1024 * 1024


def err(message: str, status: int = 400, detail: str = '') -> JSONResponse:
    body = {'error': message}
    if detail:
        body['detail'] = detail[:500]
    return JSONResponse(body, status_code=status)


async def _json(request: Request) -> dict:
    try:
        d = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return d if isinstance(d, dict) else {}


async def health(_: Request):
    return JSONResponse({'ok': True, 'mode': settings.mode, 'model': settings.model if settings.mode == 'vllm' else 'mock'})


async def ai_status(_: Request):
    host = urlparse(settings.base_url).netloc if settings.base_url else ''
    return JSONResponse({
        'mode': settings.mode, 'model': settings.model, 'host': host, 'auth': settings.auth_kind,
        'thinking': settings.thinking, 'guardrail': settings.guardrail or 'mặc định', 'jsonMode': client._json_mode,
        'maskNames': settings.mask_names, 'problems': settings.problems(),
    })


async def ai_ping(_: Request):
    """Gọi thử một câu ngắn để kiểm tra kết nối, token, tên model."""
    if settings.mode != 'vllm':
        return JSONResponse({'ok': True, 'mode': 'mock', 'reply': 'OK (mock — đặt AI_MODE=vllm để gọi thật)'})
    if settings.problems():
        return err('; '.join(settings.problems()), 400)
    t0 = time.time()
    try:
        res = await run_in_threadpool(client.chat, [{'role': 'user', 'content': 'Trả lời đúng một từ: OK'}], None, 16, 0.0)
    except VllmError as e:
        return err(str(e), 502, e.detail)
    return JSONResponse({'ok': True, 'mode': 'vllm', 'model': res['model'], 'reply': res['content'].strip()[:200],
                         'ms': int((time.time() - t0) * 1000), 'usage': res['usage']})


async def ai_models(_: Request):
    if settings.mode != 'vllm':
        return JSONResponse({'models': [], 'mode': 'mock'})
    try:
        return JSONResponse({'models': await run_in_threadpool(client.models)})
    except VllmError as e:
        return err(str(e), 502, e.detail)


async def import_file(request: Request):
    form = await request.form(max_part_size=MAX_UPLOAD)
    up = form.get('file')
    if up is None or not hasattr(up, 'read'):
        return err('Thiếu file (trường "file").')
    data = await up.read()
    if len(data) > MAX_UPLOAD:
        return err('File lớn hơn 30 MB.', 413)
    try:
        res = await run_in_threadpool(jira_import.parse, data, up.filename or 'jira.csv')
    except ValueError as e:
        return err(str(e), 400)
    except Exception as e:  # noqa: BLE001
        return err('Không đọc được file. Kiểm tra lại định dạng CSV/XLSX.', 400, str(e))
    if request.query_params.get('items') != '1':
        res = {**res, 'items': res['items'][:3], 'itemsTruncated': len(res['items']) > 3}
    return JSONResponse(res)


async def ai_draft(request: Request):
    body = await _json(request)
    rows = body.get('rows')
    if not isinstance(rows, list) or not rows:
        return err('Thiếu danh sách rows.')
    if len(rows) > 60:
        return err('Tối đa 60 dòng mỗi lần gọi.')
    if settings.mode == 'vllm' and settings.problems():
        return err('; '.join(settings.problems()), 400)
    return JSONResponse(await run_in_threadpool(drafts.draft_rows, rows))


async def agent_ask(request: Request):
    body = await _json(request)
    question = (body.get('question') or '').strip()
    rows = body.get('rows')
    if not question:
        return err('Thiếu câu hỏi (question).')
    if len(question) > 500:
        return err('Câu hỏi dài quá 500 ký tự.')
    if not isinstance(rows, list) or not rows:
        return err('Thiếu danh sách rows.')
    if len(rows) > 300:
        return err('Tối đa 300 dòng mỗi lần hỏi.')
    if settings.mode == 'vllm' and settings.problems():
        return err('; '.join(settings.problems()), 400)
    try:
        fields = body.get('fields') if isinstance(body.get('fields'), list) else None
        return JSONResponse(await run_in_threadpool(agent.ask, question, rows, fields))
    except VllmError as e:
        return err(str(e), 502, e.detail)


async def risk_assess(request: Request):
    body = await _json(request)
    text = (body.get('text') or '').strip()
    if not text:
        return err('Thiếu nội dung rủi ro (text).')
    if settings.mode == 'vllm' and settings.problems():
        return err('; '.join(settings.problems()), 400)
    try:
        return JSONResponse(await run_in_threadpool(risk.assess, text, body.get('context') or {}))
    except VllmError as e:
        return err(str(e), 502, e.detail)


routes = [
    Route('/api/health', health),
    Route('/api/ai/status', ai_status),
    Route('/api/ai/ping', ai_ping, methods=['POST', 'GET']),
    Route('/api/ai/models', ai_models),
    Route('/api/import', import_file, methods=['POST']),
    Route('/api/ai/draft', ai_draft, methods=['POST']),
    Route('/api/risk/assess', risk_assess, methods=['POST']),
    Route('/api/agent/ask', agent_ask, methods=['POST']),
]
app = Starlette(routes=routes)


def mount(fastapi_app) -> None:
    """Thêm các route AI vào app FastAPI chính (dùng `add_route`, nên không hiện trong OpenAPI)."""
    for r in routes:
        fastapi_app.add_route(r.path, r.endpoint, methods=sorted(r.methods or {'GET'}))

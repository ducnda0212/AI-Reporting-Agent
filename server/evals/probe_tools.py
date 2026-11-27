"""Thử xem nền tảng AI đang cấu hình (V-LLM hoặc OpenAI) có gọi công cụ (function calling) được không.
Chạy từ thư mục server:  python -m evals.probe_tools
Không dùng dữ liệu thật: chỉ ba công cụ giả và câu hỏi mẫu."""
import json
import sys

from app.ai.llm import VllmError, client
from app.ai.settings import settings

TOOLS = [
    {'name': 'loc_du_an', 'description': 'Liệt kê dự án theo điều kiện trên một cột của bảng.',
     'parameters': {'type': 'object', 'properties': {'cot': {'type': 'string', 'enum': ['tien_do', 'trang_thai', 'rui_ro', 'mang']}, 'gia_tri': {'type': 'string'}}, 'required': ['cot', 'gia_tri']}},
    {'name': 'xem_du_an', 'description': 'Xem chi tiết MỘT dự án, theo mã hoặc theo tên (có thể viết thiếu).',
     'parameters': {'type': 'object', 'properties': {'ma_hoac_ten': {'type': 'string'}}, 'required': ['ma_hoac_ten']}},
    {'name': 'tim_noi_dung', 'description': 'Tìm trong nội dung chữ của báo cáo (mục tiêu, KPI, vướng mắc) theo chủ đề.',
     'parameters': {'type': 'object', 'properties': {'chu_de': {'type': 'string'}}, 'required': ['chu_de']}},
]
SYSTEM = 'Bạn là trợ lý PMO. Có công cụ để đọc bảng báo cáo dự án. Hãy gọi công cụ phù hợp để lấy dữ liệu trước khi trả lời, không đoán.'
CASES = [
    ('cho t chi tiết thông tin về dự án điều phối thích ứng cho tài xế', 'xem_du_an'),
    ('dự án nào đang chậm tiến độ', 'loc_du_an'),
    ('dự án nào có nguy cơ hệ thống bị sập', 'tim_noi_dung'),
    ('xin chào', None),
]


def main() -> int:
    print(f'provider={settings.provider} model={settings.agent_model} mode={settings.mode}')
    ok = 0
    for q, want in CASES:
        try:
            r = client.chat_tools([{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': q}], TOOLS, max_tokens=200, model=settings.agent_model)
        except VllmError as e:
            print(f'LOI  {q!r}: {e} | {e.detail[:300] if hasattr(e, "detail") else ""}')
            print('=> nền tảng này KHÔNG nhận tham số tools (hoặc bị từ chối).')
            return 1
        got = r['tool_calls'][0]['name'] if r['tool_calls'] else None
        good = got == want
        ok += good
        print(f'{"DUNG" if good else "SAI "}  {q!r} -> {got} {json.dumps(r["tool_calls"][0]["arguments"], ensure_ascii=False) if r["tool_calls"] else repr(r["content"][:80])}  ({r["ms"]}ms)')
    print(f'-> {ok}/{len(CASES)}')
    return 0 if ok == len(CASES) else 2


if __name__ == '__main__':
    sys.exit(main())

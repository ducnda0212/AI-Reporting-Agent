"""Phần AI của PMO Reporting Agent. Cấu trúc:

  settings.py   cấu hình AI (đọc server/.env), tách khỏi cấu hình DB/upload của app/core
  llm.py        client V-LLM (OAuth/API key, JSON schema, sửa JSON bị cắt)
  masking.py    che tên người trước khi gửi AI, trả lại sau
  criteria.py   Bộ tiêu chí chung (ngưỡng, loại vấn đề, ma trận hành động)
  weekly.py     đọc Progress Report/Risk Notes của một dòng → cần gợi ý gì
  drafts.py     soạn nháp: đề xuất cho rủi ro thiếu, mức rủi ro
  risk.py       đánh giá rủi ro: AI phân loại và trích số, code tính điểm và Priority
  agent/        Agent trong bảng (qa.py hỏi đáp chỉ đọc, edit.py đề xuất sửa ô có xem trước)
  api.py        các route /api/ai, /api/risk, /api/agent; `mount(app)` gắn vào FastAPI

Nguyên tắc: code quyết định, AI chỉ gợi ý hoặc diễn đạt; mọi thay đổi chờ người rà soát chấp nhận.
"""

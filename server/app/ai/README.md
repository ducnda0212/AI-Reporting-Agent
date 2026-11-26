# Phần AI (`server/app/ai`)

AI phân loại, soạn nháp và trả lời; **code quyết định** (tính điểm, đếm số liệu, kiểm tra kết quả). Mọi gợi ý AI nằm riêng
và chỉ vào báo cáo khi người rà soát chấp nhận. Gọi **V-LLM** (chuẩn OpenAI) bằng thư viện chuẩn, không cần SDK.

## Cấu trúc

```
app/ai/
├─ settings.py   đọc server/.env (cấu hình AI), tách khỏi app/core (DB, upload)
├─ llm.py        client V-LLM: token OAuth/API key, thử lại, ép JSON theo schema, đọc JSON lẫn <think>/```json, sửa JSON bị cắt
├─ masking.py    che tên người thành [Người n] trước khi gửi AI, trả lại sau
├─ criteria.py   Bộ tiêu chí chung v1 (ngưỡng, loại C1–C10, ma trận hành động); khớp client/src/data/risk.ts
├─ weekly.py     đọc Progress Report/Risk Notes của một dòng theo tuần (quy tắc, không AI) → có cần gợi ý không
├─ drafts.py     soạn nháp: đề xuất cho rủi ro thiếu, mức rủi ro; lọc số liệu/ngưỡng AI tự thêm
├─ risk.py       đánh giá rủi ro: AI phân loại và trích số, code tính Impact × Urgency → P1–P4 (cùng công thức client/src/lib/risk.ts)
├─ agent/
│  ├─ qa.py      hỏi đáp chỉ đọc: chọn truy vấn → code tính → AI diễn đạt → code kiểm lại
│  └─ edit.py    đề xuất sửa ô có xem trước: AI đọc lệnh → code kiểm tra → {code, field, from, to}; không tự ghi
└─ api.py        các route AI; `mount(app)` gắn vào FastAPI chính (main.py), `app` chạy riêng được
```

Ngoài package: `app/jira_import.py` (đọc file Jira kiểu cũ, route `/api/import`) đã được `/api/v1/ingest/upload` thay thế;
bỏ được khi không còn dùng. `evals/` chấm chất lượng AI; kết quả mới nhất ở `evals/DANH-GIA-AI.md`.

## Chạy

Từ gốc repo: `uvicorn server.app.main:app --port 8000`, hoặc `python server/run.py` (cùng việc, kèm in trạng thái AI).
Terminal thứ hai: `cd client` rồi `npm run dev` (Vite chuyển `/api` sang cổng 8000).

## Cấu hình (`server/.env`, mẫu ở `.env.example`)

| Biến | Ý nghĩa |
|---|---|
| `AI_MODE` | `mock` chạy thử không gọi AI · `vllm` gọi thật |
| `VLLM_BASE_URL` | `https://<host>/<tenant>/v1` — **phải kết thúc bằng `/v1`** |
| `VLLM_MODEL` | Model cho soạn nháp và đánh giá rủi ro. Đang dùng `v-llm-v1-medium` |
| `AGENT_MODEL` | Model cho Agent hỏi đáp/sửa ô. Trống = dùng `VLLM_MODEL` |
| `VLLM_API_KEY` | Token/API key có sẵn. Hoặc để trống và dùng bộ OAuth dưới |
| `VLLM_AUTH_URL`, `VLLM_CLIENT_ID`, `VLLM_CLIENT_SECRET`, `VLLM_PROJECT_ID` | Tự lấy token qua `/oauth/token`, tự làm mới khi hết hạn hoặc bị 401 |
| `VLLM_THINKING` | `0` = tắt "suy nghĩ" (nhanh, JSON sạch) |
| `VLLM_GUARDRAIL` | để trống = mặc định nền tảng · `low` / `large` / `off` |
| `VLLM_JSON_MODE` | `schema` (ép JSON theo schema). V-LLM từ chối thì tự hạ xuống `object` rồi `none` |
| `VLLM_CA_BUNDLE` | File `.pem` nếu mạng công ty dùng chứng chỉ riêng |
| `AI_MASK_NAMES` | `1` = thay tên người bằng `[Người n]` trước khi gửi AI |

Không đưa `server/.env` lên git, không dán khoá vào chat.

## API

| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/health` | AI đang ở chế độ nào |
| GET | `/api/ai/status` · `/api/ai/models` · GET/POST `/api/ai/ping` | Kiểm tra cấu hình và kết nối V-LLM (`problems` liệt kê chỗ còn thiếu) |
| POST | `/api/ai/draft` `{rows:[...]}` | Ô "Vấn đề, rủi ro và Đề xuất" + gợi ý Mức độ rủi ro, tối đa 60 dự án/lần. Chỉ gọi V-LLM khi thiếu đề xuất hoặc report có dấu hiệu mà chưa ghi rủi ro. Gợi ý trả riêng trong `issues.suggestion`; lỗi từng dòng trong `errors` |
| POST | `/api/risk/assess` `{text, context}` | AI phân loại Risk/Issue/Dependency, C1–C10, trích số, gắn R-xx, đề xuất action; hệ thống tự tính Priority và màu |
| POST | `/api/agent/ask` `{question, rows, fields?}` | Hỏi đáp số liệu, hoặc lệnh sửa ô (cần `fields` và `rows[].values`) → `proposals` xem trước, `applied` luôn `false` |
| POST | `/api/import` | (cũ) đọc file Jira; dùng `/api/v1/ingest/upload` |

Agent sửa ô: cột `editable: false` (lấy từ Jira) không bao giờ được đề xuất sửa; giá trị phải nằm trong `options` nếu có;
tối đa 5 thao tác và 50 ô mỗi lệnh. Giao diện áp dụng sau khi người dùng duyệt.

## Kiểm thử

```bash
python -m pytest -q server/tests          # từ gốc repo; test AI dùng V-LLM giả, không đọc .env
RUN_LIVE=1 python -m pytest -s server/tests/test_live_vllm.py   # gọi V-LLM THẬT bằng server/.env (PowerShell: $env:RUN_LIVE="1")
```

`tests/conftest.py` đặt biến môi trường giả TRƯỚC khi import app (bỏ qua `.env` thật) nên test thường không bao giờ gọi V-LLM thật.

## Đánh giá chất lượng (`server/evals`)

```bash
python -m evals.run_eval --mode mock                                  # kiểm tra script, không gọi AI
python -m evals.run_eval --mode live --timeout 30                     # 26 ca V01–V26 với V-LLM thật (model theo .env)
python -m evals.run_eval --mode live --model v-llm-v1-large --limit 5 # thử model khác cho riêng lần chạy
python -m evals.ping -n 5 --model v-llm-v1-medium                     # đo thời gian một câu ngắn
```

Chấm 6 tiêu chí (Độ chính xác, Bám nguồn, Tính đầy đủ, Tuân thủ chỉ dẫn, Nhận biết bối cảnh, Chỉ số riêng) kèm P50/P95.
Báo cáo lưu ở `evals/out/` (không đưa lên git). Kết quả và quyết định hiện tại: `evals/DANH-GIA-AI.md`.

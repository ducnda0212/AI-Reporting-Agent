# Server — Jira CSV Import Backend (Đợt 1)

Backend FastAPI tiếp nhận file Jira CSV thô (277 cột), lưu trữ, kiểm tra trùng lặp và trích xuất thông tin cột để màn hình **Nhập file** của client hiển thị số liệu thật (không dùng mock).

> Phạm vi Đợt 1: upload, lưu file, phát hiện trùng, đọc/profiling 277 cột, lịch sử nạp.
> **Chưa làm (Đợt 2):** ánh xạ sang mẫu 49 cột, Master Catalog, cấu hình mapping (CRUD/clone), incremental diff, bóc mã dự án từ `Summary`, trích xuất `Progress Report`. Xem `docs/superpowers/specs/2026-11-18-jira-csv-import-and-mapping-design.md`.

## Đã làm được

- **Parser** (`parsers/jira_csv_parser.py`): đọc CSV bằng `csv.reader` (RFC 4180), hỗ trợ UTF-8 và UTF-8 BOM (định dạng mặc định của Jira).
  - Giữ đủ mọi cột, kể cả **cột trùng tên** (ví dụ `Custom field (PRD)` xuất hiện 3 lần) — mỗi cột được định danh bằng `(index, name)`.
  - Ô **nhiều dòng** (bảng Jira Wiki trong `Progress Report`) được đọc nguyên vẹn.
  - Mỗi cột có `non_null_count` và tối đa 5 `sample_values` khác nhau, không rỗng.
  - Hàng thiếu/thừa ô được chuẩn hóa, dòng trống bị bỏ qua; file rỗng hoặc sai mã hóa ném `ValueError` (API trả 400).
  - Hiệu năng: 277 cột × 200 issue ≈ 36 ms (yêu cầu < 300 ms, có test).
- **Lưu trữ** (`services/file_storage_service.py`):
  - File lưu tại `storage/uploads/{timestamp}_{hash[:8]}_{filename}`; tên file được làm sạch (chặn path traversal, ký tự cấm của Windows, giới hạn độ dài).
  - Tính **SHA-256**; trùng khi cùng hash **và** cùng `target_week` → trả bản ghi cũ, không lưu lại.
  - Lịch sử nạp ở `storage/uploads_meta.json`, ghi nguyên tử (file tạm + `os.replace`); file meta hỏng được đổi tên `.corrupt` thay vì bị mất âm thầm.
- **API** (`routers/import_router.py`):

  | Method | Đường dẫn | Mô tả |
  |---|---|---|
  | GET | `/api/health` | `{"status": "ok"}` |
  | POST | `/api/import/upload?target_week=w3` | Upload CSV (`multipart/form-data`, field `file`) |
  | GET | `/api/import/history` | Danh sách lần nạp gần nhất (mới nhất trước) |
  | GET | `/api/import/history/{file_id}` | Xem lại chi tiết file đã nạp (parse lại từ file đã lưu) |

  Upload trả về:
  ```json
  {
    "file_info":  { "id", "filename", "is_duplicate", "file_hash", "file_size", "uploaded_at", "target_week" },
    "file_stats": { "total_cols", "total_issues", "duplicate_groups", "loaded_at" },
    "columns":    [ { "index", "name", "non_null_count", "sample_values" } ],
    "issues_sample": [ /* tối đa 5 issue đầu */ ]
  }
  ```
  Lỗi trả **400** khi: file rỗng/sai định dạng/không phải `.csv`, hoặc vượt **25 MB** (đọc tối đa `limit+1` byte, không tin `Content-Length`). File được parse **trước** khi lưu nên file lỗi không bao giờ được lưu. `history/{id}` không tồn tại → **404**.
- **Client** (`client/`): màn hình Nhập file gửi file thật, hiển thị số liệu thật, danh sách "Lần nhập gần nhất" từ API và banner khi file trùng. Chi tiết xem `client/README.md`.

## Cấu trúc

```text
server/
├── main.py                    # FastAPI app, CORS, đăng ký router
├── requirements.txt
├── core/config.py             # STORAGE_DIR, UPLOADS_DIR, META_FILE, MAX_UPLOAD_BYTES, CORS_ORIGINS
├── parsers/jira_csv_parser.py # parse_jira_csv(content) -> JiraParsedData
├── services/file_storage_service.py
├── routers/import_router.py
├── storage/                   # tạo khi chạy, đã git-ignore (uploads/, uploads_meta.json)
└── tests/                     # pytest; tests/data/ chứa file mẫu 277 cột đã ẩn danh
```

## Khởi chạy backend

Yêu cầu: Python 3.10+ (đã thử với 3.11). Chạy các lệnh dưới đây **từ thư mục gốc repo** (không phải từ `server/`), vì import dạng `server.main`.

**1. Tạo virtual environment và cài dependencies (một lần)**

```powershell
python -m venv server/.venv
server/.venv/Scripts/python -m pip install -r server/requirements.txt
```
(macOS/Linux: dùng `server/.venv/bin/python`.)

**2. Chạy server**

```powershell
server/.venv/Scripts/python -m uvicorn server.main:app --port 8000
```
Thêm `--reload` khi phát triển. Kiểm tra: mở http://localhost:8000/api/health hoặc tài liệu API tự sinh tại http://localhost:8000/docs.

**3. Chạy client cùng lúc**

```powershell
cd client
npm install   # lần đầu
npm run dev
```
Vite chạy ở http://localhost:5173 và proxy `/api` sang `http://127.0.0.1:8000` (`client/vite.config.ts`). Kéo thả file Jira CSV vào màn hình Nhập file.

> Nếu thấy "Không kết nối được backend" / log `ECONNREFUSED ::1:8000`: backend chưa chạy, hoặc proxy đang trỏ `localhost` (Node 17+ ưu tiên IPv6 `::1` trong khi uvicorn chỉ nghe IPv4). Proxy đã dùng `127.0.0.1` để tránh lỗi này.

**Thử nhanh bằng curl**

```bash
curl -F "file=@docs/samples/sample_jira_277_cols.csv;type=text/csv" "http://localhost:8000/api/import/upload?target_week=w3"
curl http://localhost:8000/api/import/history
```
Upload lần 2 cùng file → `file_info.is_duplicate: true`.

## Chạy test

```powershell
server/.venv/Scripts/python -m pytest server -v
```
Hiện có 18 test (health, parser, lưu trữ/trùng lặp, API, E2E với file mẫu 277 cột, hiệu năng). Test dùng `tmp_path` và monkeypatch `server.core.config`, không ghi vào `storage/` thật.

## Lưu ý

- `storage/` được git-ignore; xóa thư mục này để reset lịch sử nạp.
- Ghi file meta chưa có khóa (lock): phù hợp chạy một tiến trình, chưa an toàn cho nhiều worker ghi đồng thời.
- File mẫu `tests/data/sample_jira_277_cols.csv` đã ẩn danh host/tài khoản/tên; bản gốc nằm trong `docs/samples/` (chưa tracked).
- CORS chỉ cho phép `http://localhost:5173`; khi chạy qua Vite proxy thì cùng origin nên không cần thay đổi.

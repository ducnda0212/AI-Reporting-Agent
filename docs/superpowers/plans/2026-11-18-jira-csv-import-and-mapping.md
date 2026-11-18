# Đợt 1: Jira CSV Upload & Inspection Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hoàn chỉnh tầng Backend Python (FastAPI) tiếp nhận file Jira CSV thô (277 cột), lưu trữ vật lý, phát hiện trùng lặp bằng SHA-256, parse toàn bộ các cột trùng tên và ô văn bản nhiều dòng, trích xuất siêu dữ liệu/giá trị mẫu của 277 cột, duy trì lịch sử nạp và kết nối thật 100% với màn hình Nhập file trên Frontend React.

**Architecture:** 
- **Backend (Python / FastAPI):** Tầng Ingestion độc lập tiếp nhận file qua `multipart/form-data`, lưu trữ an toàn vào `server/storage/uploads/`, tính SHA-256 kiểm tra trùng lặp tức thì, dùng `csv.reader` streaming đọc an toàn 277 cột (xử lý trùng tên và multi-line), phân tích cấu trúc cột (profiling) và ghi nhận lịch sử vào `uploads_meta.json`.
- **Frontend (React / Vite):** Gọi API qua Vite proxy `/api`, thay thế mock hoàn toàn ở màn hình `ImportView.tsx`: kéo thả file thật, hiển thị số liệu đọc file thật, thông báo file trùng lặp, và hiển thị danh sách "Lần nhập gần nhất" từ backend.
- **Phạm vi:** Tập trung 100% vào việc upload, lưu trữ, kiểm tra file và trích xuất 277 cột. Logic ánh xạ (Mapping) sang mẫu 49 cột sẽ được thực hiện ở Đợt 2 sau khi Đợt 1 hoàn hảo.

**Tech Stack:** Python 3.10+, FastAPI, Uvicorn, Python standard `csv` & `hashlib`, Pydantic v2, Pytest, React 18, TypeScript, Zustand, Vite.

**Spec:** [docs/superpowers/specs/2026-11-18-jira-csv-import-and-mapping-design.md](file:///d:/.2_VinSmart%20Future/AI-Reporting-Agent/docs/superpowers/specs/2026-11-18-jira-csv-import-and-mapping-design.md)

---

## Global Constraints

- Backend đặt độc lập trong thư mục `server/`, có virtual environment riêng, không đụng chạm tới `package.json` của `client/`.
- Mã hóa tiếng Việt: Hỗ trợ UTF-8 và UTF-8 with BOM (định dạng xuất mặc định của Jira).
- Xử lý các cột trùng tên bằng định danh cặp `(index, name)` duy nhất; không được làm mất bất kỳ cột nào trong số 277 cột.
- File upload được lưu với định danh an toàn: `server/storage/uploads/{timestamp}_{hash[:8]}_{filename}`.
- Tốc độ xử lý file Jira CSV 277 cột x 50-200 issues phải đạt < 300ms.

---

## Review Focus

1. **Cột trùng tên không bị ghi đè:** Ví dụ `Custom field (PRD)` xuất hiện 3 lần ở các index 145, 146, 147 phải xuất hiện đủ 3 cột trong danh sách trả về.
2. **Ký tự xuống dòng trong ô CSV (Multi-line quoted strings):** Trường `Custom field (Progress Report)` có bảng markdown nhiều dòng không làm vỡ cấu trúc hàng của CSV.
3. **Phát hiện trùng lặp SHA-256:** Upload cùng 1 file 2 lần liên tiếp phải trả về `is_duplicate: true` và thông tin file đã nạp trước đó.
4. **Trích xuất giá trị mẫu (Sample values):** Mỗi cột trong 277 cột phải có từ 1–5 giá trị mẫu không rỗng để phục vụ màn hình kiểm tra sau này.
5. **Đồng bộ UI "Lần nhập gần nhất":** Danh sách file hiển thị ở màn hình Nhập file phải lấy dữ liệu thật từ API `GET /api/import/history`.

---

## Danh sách Files được tạo mới & chỉnh sửa

### Backend (`server/`)
- `server/requirements.txt`: Khai báo dependencies (`fastapi`, `uvicorn`, `python-multipart`, `pydantic`, `pytest`, `httpx`).
- `server/core/config.py`: Cấu hình đường dẫn thư mục lưu trữ (`storage/uploads/`, `uploads_meta.json`) và CORS.
- `server/parsers/jira_csv_parser.py`: Bộ đọc CSV 277 cột xử lý quote, newline, cột trùng tên, và trích xuất sample values.
- `server/services/file_storage_service.py`: Lưu file vật lý, tính SHA-256, kiểm tra file trùng lặp và quản lý metadata lịch sử.
- `server/routers/import_router.py`: REST API endpoints:
  * `POST /api/import/upload`: Tiếp nhận file CSV, kiểm tra trùng, parse và trả về kết quả.
  * `GET /api/import/history`: Trả về danh sách các lần nạp gần nhất.
  * `GET /api/import/history/{file_id}`: Xem lại chi tiết siêu dữ liệu của một file đã nạp.
- `server/main.py`: Khởi tạo FastAPI app và cấu hình router.
- `server/tests/`: Bộ unit tests kiểm thử parser, storage, và API endpoints.

### Frontend (`client/`)
- `client/src/api/importApi.ts`: Client gọi các endpoints của import backend.
- `client/src/types/index.ts`: Bổ sung interface `JiraColumnMeta`, `ImportHistoryItem`, `ImportUploadResponse`.
- `client/src/store/types.ts`: Bổ sung fields lưu trữ thông tin file thật và danh sách 277 cột Jira.
- `client/src/store/actions/flow.ts`: Điều chỉnh hàm `loadFile` và bổ sung action xử lý kết quả upload thật.
- `client/src/views/Import/ImportView.tsx`: Nối sự kiện kéo thả file thật, hiển thị số liệu thật và lịch sử nạp thật.

---

## Kế hoạch Thực hiện Từng Task

### Task 1: Khởi tạo Backend FastAPI & Virtual Environment

**Files:**
- Create: `server/requirements.txt`
- Create: `server/core/config.py`
- Create: `server/main.py`
- Test: `server/tests/test_health.py`

**Interfaces:**
- Produces: `GET /api/health` -> `{"status": "ok"}`

- [ ] **Step 1: Viết test kiểm tra healthz**
```python
# server/tests/test_health.py
from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
```

- [ ] **Step 2: Chạy test xác nhận fail**
Run: `python -m pytest server/tests/test_health.py -v`
Expected: FAIL

- [ ] **Step 3: Cài đặt virtualenv, dependencies và server entrypoint**
  - Tạo `server/requirements.txt` gồm: `fastapi>=0.110.0`, `uvicorn>=0.28.0`, `python-multipart>=0.0.9`, `pydantic>=2.6.0`, `pytest>=8.0.0`, `httpx>=0.27.0`.
  - Tạo virtual environment và cài đặt requirements.
  - Cài đặt `server/core/config.py` định nghĩa các thư mục `STORAGE_DIR = Path(...)`, `UPLOADS_DIR`, `META_FILE`.
  - Cài đặt `server/main.py` với CORS cho `http://localhost:5173` và endpoint `GET /api/health`.

- [ ] **Step 4: Chạy test xác nhận pass**
Run: `python -m pytest server/tests/test_health.py -v`
Expected: PASS

- [ ] **Step 5: Commit mã nguồn Task 1**
```bash
git add server/
git commit -m "feat(server): setup FastAPI backend environment and health endpoint"
```

---

### Task 2: Bộ đọc Jira CSV Parser (277 cột, Cột trùng tên & Multi-line Markdown)

**Files:**
- Create: `server/parsers/jira_csv_parser.py`
- Test: `server/tests/test_jira_csv_parser.py`

**Interfaces:**
- Produces:
  - `class JiraColumnInfo(BaseModel): index: int, name: str, non_null_count: int, sample_values: list[str]`
  - `class JiraParsedData(BaseModel): columns: list[JiraColumnInfo], issues: list[dict[str, Any]], stats: dict[str, Any]`
  - `parse_jira_csv(content: bytes | str) -> JiraParsedData`

- [ ] **Step 1: Viết test cho parser với cột trùng tên, ký tự xuống dòng và bảng markdown**
```python
# server/tests/test_jira_csv_parser.py
from server.parsers.jira_csv_parser import parse_jira_csv

def test_parse_jira_csv_handles_duplicates_and_multiline():
    csv_text = """"Summary","Status","Custom field (PRD)","Custom field (PRD)","Custom field (Progress Report)"
"I.A.5.1 Project A","IN PROGRESS","doc_link_1","doc_link_2","||*Week*||*Progress*||
|2026-11-06|Done task|"
"II.E.1.2 Project B","DONE","doc_link_3","","Single line"
"""
    data = parse_jira_csv(csv_text.encode("utf-8"))
    assert len(data.columns) == 5
    assert data.columns[2].name == "Custom field (PRD)"
    assert data.columns[2].index == 2
    assert data.columns[3].name == "Custom field (PRD)"
    assert data.columns[3].index == 3
    assert len(data.columns[2].sample_values) == 2
    assert len(data.issues) == 2
    assert data.stats["total_cols"] == 5
    assert data.stats["total_issues"] == 2
    assert data.stats["duplicate_groups"] == 1
    # Kiểm tra ô multi-line chứa bảng markdown được đọc nguyên vẹn
    assert "||*Week*||*Progress*||" in data.issues[0]["_raw_by_index"][4]
```

- [ ] **Step 2: Chạy test xác nhận fail**
Run: `python -m pytest server/tests/test_jira_csv_parser.py -v`
Expected: FAIL

- [ ] **Step 3: Cài đặt `server/parsers/jira_csv_parser.py`**
  - Xử lý giải mã bytes sang string hỗ trợ `utf-8-sig` (BOM) và `utf-8`.
  - Sử dụng `csv.reader(io.StringIO(text))` để xử lý chuẩn xác RFC 4180 cho các ô nhiều dòng có dấu ngoặc kép.
  - Quét Header dòng 1: xây dựng mảng `columns` với mỗi cột mang `index` từ `0` đến `N-1`. Phát hiện các nhóm cột trùng tên.
  - Quét từng dòng dữ liệu:
    * Cập nhật `non_null_count` và thu thập tối đa 5 giá trị mẫu (`sample_values`) phân biệt, bỏ qua giá trị rỗng.
    * Lưu dictionary dòng với 2 cách truy xuất: theo tên cột (ưu tiên giá trị không rỗng đầu tiên) và theo `_raw_by_index` (định danh tuyệt đối).
  - Trả về đối tượng `JiraParsedData`.

- [ ] **Step 4: Chạy test xác nhận pass**
Run: `python -m pytest server/tests/test_jira_csv_parser.py -v`
Expected: PASS

- [ ] **Step 5: Commit mã nguồn Task 2**
```bash
git add server/parsers/ server/tests/test_jira_csv_parser.py
git commit -m "feat(server): implement 277-col Jira CSV parser with duplicate header and multiline support"
```

---

### Task 3: Dịch vụ Lưu trữ File, SHA-256 Checksum & Lịch sử Nạp

**Files:**
- Create: `server/services/file_storage_service.py`
- Test: `server/tests/test_file_storage.py`

**Interfaces:**
- Produces:
  - `class FileMetadata(BaseModel): id: str, filename: str, file_path: str, file_hash: str, file_size: int, uploaded_at: str, total_issues: int, total_cols: int, target_week: str`
  - `FileStorageService.save_file(content: bytes, filename: str, target_week: str, total_issues: int, total_cols: int) -> FileMetadata`
  - `FileStorageService.check_duplicate(content: bytes, target_week: str) -> tuple[bool, FileMetadata | None]`
  - `FileStorageService.get_history() -> list[FileMetadata]`
  - `FileStorageService.get_file_by_id(file_id: str) -> tuple[FileMetadata, bytes]`

- [ ] **Step 1: Viết test cho lưu trữ, hash trùng lặp và lịch sử**
```python
# server/tests/test_file_storage.py
import pytest
from server.services.file_storage_service import FileStorageService

def test_file_storage_save_and_duplicate(tmp_path, monkeypatch):
    monkeypatch.setattr("server.core.config.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("server.core.config.UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setattr("server.core.config.META_FILE", tmp_path / "uploads_meta.json")
    
    service = FileStorageService()
    content = b"Summary,Status\nIssue 1,Open"
    
    # Lần 1: Lưu file mới
    meta1 = service.save_file(content, "jira_report.csv", "w3", total_issues=1, total_cols=2)
    assert meta1.filename == "jira_report.csv"
    assert (tmp_path / "uploads").exists()
    
    # Lần 2: Kiểm tra file trùng lặp
    is_dup, dup_meta = service.check_duplicate(content, "w3")
    assert is_dup is True
    assert dup_meta.id == meta1.id
    
    # Lấy lịch sử nạp
    history = service.get_history()
    assert len(history) == 1
    assert history[0].id == meta1.id
```

- [ ] **Step 2: Chạy test xác nhận fail**
Run: `python -m pytest server/tests/test_file_storage.py -v`
Expected: FAIL

- [ ] **Step 3: Cài đặt `server/services/file_storage_service.py`**
  - Tự động tạo thư mục `storage/uploads/` nếu chưa có.
  - Tính mã băm `hashlib.sha256(content).hexdigest()`.
  - Lưu file vật lý với tên `{timestamp}_{hash[:8]}_{filename}`.
  - Đọc/ghi file `storage/uploads_meta.json` an toàn dưới dạng mảng JSON.
  - Cung cấp các hàm kiểm tra trùng theo hash + tuần mục tiêu, lấy lịch sử sắp xếp theo thời gian mới nhất trước.

- [ ] **Step 4: Chạy test xác nhận pass**
Run: `python -m pytest server/tests/test_file_storage.py -v`
Expected: PASS

- [ ] **Step 5: Commit mã nguồn Task 3**
```bash
git add server/services/file_storage_service.py server/tests/test_file_storage.py
git commit -m "feat(server): implement physical file storage, SHA-256 duplicate check, and upload history"
```

---

### Task 4: API Endpoints Upload & Quản lý Lịch sử File (`/api/import`)

**Files:**
- Create: `server/routers/import_router.py`
- Modify: `server/main.py`
- Test: `server/tests/test_import_router.py`

**Interfaces:**
- Produces:
  - `POST /api/import/upload`: Upload file CSV Jira, kiểm tra trùng, trả về metadata và thông tin 277 cột.
  - `GET /api/import/history`: Lấy danh sách các lần nạp trước đây.
  - `GET /api/import/history/{file_id}`: Xem lại dữ liệu của file đã nạp.

- [ ] **Step 1: Viết test API cho upload và history**
```python
# server/tests/test_import_router.py
from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

def test_api_upload_jira_csv(tmp_path, monkeypatch):
    monkeypatch.setattr("server.core.config.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("server.core.config.UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setattr("server.core.config.META_FILE", tmp_path / "uploads_meta.json")

    sample_csv = b"""Summary,Status,Assignee\n"I.A.1 Project 1",IN PROGRESS,User A\n"I.A.2 Project 2",DONE,User B"""
    files = {"file": ("test_jira.csv", sample_csv, "text/csv")}
    
    # 1. Upload lần đầu
    res = client.post("/api/import/upload?target_week=w3", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["file_info"]["filename"] == "test_jira.csv"
    assert data["file_info"]["is_duplicate"] is False
    assert data["file_stats"]["total_cols"] == 3
    assert data["file_stats"]["total_issues"] == 2
    assert len(data["columns"]) == 3
    assert data["columns"][0]["name"] == "Summary"
    assert len(data["columns"][0]["sample_values"]) == 2

    # 2. Upload lại cùng file -> is_duplicate: True
    res2 = client.post("/api/import/upload?target_week=w3", files={"file": ("test_jira.csv", sample_csv, "text/csv")})
    assert res2.status_code == 200
    assert res2.json()["file_info"]["is_duplicate"] is True

    # 3. Lấy lịch sử
    hist_res = client.get("/api/import/history")
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1
```

- [ ] **Step 2: Chạy test xác nhận fail**
Run: `python -m pytest server/tests/test_import_router.py -v`
Expected: FAIL

- [ ] **Step 3: Cài đặt `server/routers/import_router.py` và đăng ký router vào `main.py`**
  - Nhận `file: UploadFile`, `target_week: str = "w3"`.
  - Giới hạn file size tối đa (25MB). Nếu vượt quá trả về lỗi HTTP 400.
  - Đọc file bytes, kiểm tra SHA-256 duplicate.
  - Parse qua `jira_csv_parser.py` để lấy danh sách cột và số liệu thống kê.
  - Lưu file qua `file_storage_service.py`.
  - Trả về payload JSON chứa đầy đủ `file_info`, `file_stats`, `columns` và preview dữ liệu.

- [ ] **Step 4: Chạy test xác nhận pass**
Run: `python -m pytest server/tests/test_import_router.py -v`
Expected: PASS

- [ ] **Step 5: Commit mã nguồn Task 4**
```bash
git add server/routers/import_router.py server/main.py server/tests/test_import_router.py
git commit -m "feat(server): implement upload CSV inspection and history REST endpoints"
```

---

### Task 5: Tích hợp Frontend Client — Gọi API Thật & Hiển thị Lịch sử File

**Files:**
- Create: `client/src/api/importApi.ts`
- Modify: `client/src/types/index.ts`
- Modify: `client/src/store/types.ts`
- Modify: `client/src/store/actions/flow.ts`
- Modify: `client/src/views/Import/ImportView.tsx`
- Test: `client/src/__tests__/importView.test.tsx`

**Interfaces:**
- Consumes: Backend `/api/import/upload`, `/api/import/history`
- Produces: Kéo thả file CSV thật, thanh trạng thái đọc file thật, hiển thị cảnh báo file trùng, nạp lại file cũ từ lịch sử thật.

- [ ] **Step 1: Viết test cho API client và hành động upload file thật**
```typescript
// client/src/__tests__/importView.test.ts
import { describe, it, expect } from 'vitest';
import { handleUploadSuccess } from '@/store/actions/flow';
import { getState } from '@/store';

describe('Real Import Flow Action', () => {
  it('updates store with real parsed columns and file stats', () => {
    const mockUploadResponse = {
      file_info: { id: 'file-123', filename: 'jira_real.csv', is_duplicate: false },
      file_stats: { total_cols: 277, total_issues: 39, duplicate_groups: 12, loaded_at: '10:00' },
      columns: [
        { index: 0, name: 'Summary', non_null_count: 39, sample_values: ['I.A.5.1 Task 1'] }
      ],
      issues_sample: []
    };
    handleUploadSuccess(mockUploadResponse);
    const s = getState();
    expect(s.fileName).toBe('jira_real.csv');
    expect(s.fileStats.cols).toBe(277);
    expect(s.fileStats.dupGroups).toBe(12);
  });
});
```

- [ ] **Step 2: Chạy test xác nhận fail**
Run: `npm test client/src/__tests__/importView.test.ts`
Expected: FAIL

- [ ] **Step 3: Cài đặt code Frontend**
  - Tạo `client/src/api/importApi.ts`:
    * `uploadJiraCsv(file: File, targetWeek?: string)`
    * `getImportHistory()`
    * `reapplyHistoryFile(fileId: str)`
  - Cập nhật `client/src/store/types.ts`: Bổ sung `rawCols: JiraColumnInfo[]`, `fileStats`, `isDuplicateAlert`.
  - Cập nhật `client/src/store/actions/flow.ts`:
    * Hàm `uploadFileReal(file: File)`: kích hoạt animation đọc file thật, gọi API, cập nhật state với số liệu thực tế.
    * Hàm `loadHistoryList()`: tải danh sách file thật từ backend.
  - Cập nhật `client/src/views/Import/ImportView.tsx`:
    * `DropZone`: nhận file `File` thật từ kéo thả hoặc input `onChange`.
    * `PreLoad`: gọi `loadHistoryList()` để render danh sách "Lần nhập gần nhất" từ API thay cho mảng tĩnh `IMPORTS`.
    * `Importing`: hiển thị số liệu thực tế (`${s.fileStats.cols} cột`, `${s.fileStats.totalIssues} issue`) trong tiến trình đọc.
    * Hiển thị banner cảnh báo nếu `isDuplicateAlert` được bật (file đã nạp trước đó).

- [ ] **Step 4: Chạy test xác nhận pass**
Run: `npm test client/src/__tests__/importView.test.ts`
Expected: PASS

- [ ] **Step 5: Chạy full test suite của Client**
Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit mã nguồn Task 5**
```bash
git add client/src/
git commit -m "feat(client): connect real CSV upload, parsing stats, duplicate alert, and history list"
```

---

### Task 6: Kiểm thử Toàn trình (End-to-End Verification) với File Sample Thật

**Files:**
- Test file: `server/tests/test_e2e_real_sample.py`
- Test sample data: Lưu trữ file sample 277 cột ẩn danh của người dùng tại `server/tests/data/sample_jira_277_cols.csv`

- [ ] **Step 1: Tạo test E2E với chính file sample thực tế của người dùng**
```python
# server/tests/test_e2e_real_sample.py
from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

def test_real_sample_csv_e2e():
    with open("server/tests/data/sample_jira_277_cols.csv", "rb") as f:
        file_bytes = f.read()
    
    res = client.post("/api/import/upload?target_week=w3", files={"file": ("Jira_Sample.csv", file_bytes, "text/csv")})
    assert res.status_code == 200
    data = res.json()
    assert data["file_stats"]["total_cols"] == 277
    assert data["file_stats"]["total_issues"] >= 2
    # Kiểm tra cột trùng tên Custom field (PRD) có đủ các index
    prd_cols = [c for c in data["columns"] if c["name"] == "Custom field (PRD)"]
    assert len(prd_cols) >= 2
    # Kiểm tra các cột quan trọng có sample values
    summary_col = next(c for c in data["columns"] if c["name"] == "Summary")
    assert any("I.A.5.1" in v for v in summary_col["sample_values"])
```

- [ ] **Step 2: Chạy test E2E backend xác nhận pass**
Run: `python -m pytest server/tests/test_e2e_real_sample.py -v`
Expected: PASS

- [ ] **Step 3: Chạy thực tế cả Backend và Frontend để người dùng trải nghiệm**
  - Chạy `uvicorn server.main:app --port 8000`
  - Chạy `npm run dev` trên `client` (proxy `/api` trỏ về port 8000)
  - Kéo thả file sample thật vào trình duyệt:
    * Màn hình "Đang đọc file" hiện dần các số liệu thật: 277 cột, issue, nhóm cột trùng.
    * Sang màn hình tóm tắt với đúng tên file thật.
    * Reload lại trang -> Mục "Lần nhập gần nhất" hiển thị đúng file vừa nạp.
    * Thử kéo thả lại đúng file đó -> Nhận thông báo phát hiện file trùng lặp.

- [ ] **Step 4: Commit hoàn tất Đợt 1**
```bash
git commit -m "test(e2e): complete Phase 1 Jira CSV upload, storage, 277-col profiling, and frontend integration"
```

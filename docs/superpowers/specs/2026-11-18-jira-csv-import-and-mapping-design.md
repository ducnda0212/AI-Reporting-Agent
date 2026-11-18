# Thiết kế Kỹ thuật: Hệ thống Nhập dữ liệu Jira CSV & Quản lý Cấu hình Ánh xạ (Import & Mapping Config Engine)

- **Ngày tạo:** 2026-11-18
- **Trạng thái:** Đã phê duyệt thiết kế (Approved)
- **Tác giả:** Antigravity / DeepMind
- **Phạm vi:** Backend Python (FastAPI) + Tích hợp Frontend (React/Zustand)

---

## 1. Mục tiêu & Bối cảnh (Intent & The Why)

Hệ thống **AI-Reporting-Agent** hiện đang chạy trên Frontend React với dữ liệu giả lập (`demo.json`). Để đưa ứng dụng vào vận hành thực tế cho văn phòng PMO, bước đầu tiên và cốt lõi là **nạp dữ liệu thực tế từ file CSV do Jira xuất ra hàng tuần** và chuyển đổi chính xác vào **mẫu báo cáo 49 cột của PMO**.

### Bối cảnh dữ liệu thực tế
Qua phân tích thực tế từ 2 file mẫu:
- **File Jira CSV:** Chứa **277 cột** với nhiều cột trùng tên chính xác (do Jira custom field đa ngữ cảnh), các ô chứa văn bản nhiều dòng kèm bảng Jira Wiki phức tạp (`Custom field (Progress Report)`, `KPI/Outcome`, `Risk Notes`), và mã dự án được đặt ở đầu trường `Summary` (ví dụ: `I.A.5.1 Nền tảng...`).
- **File Template PMO:** Gồm **49 cột** cố định, trong đó chỉ khoảng 12–15 cột lấy dữ liệu động từ Jira, 15 cột lấy từ danh mục chuẩn (Master Catalog), 9–12 cột là dữ liệu lịch sử các tuần trước, và các cột còn lại do AI chấm điểm hoặc công thức tính.

### Mục tiêu (Goals)
1. Xây dựng dịch vụ Backend Python (FastAPI) tiếp nhận file Jira CSV thô, xử lý chuẩn xác 277 cột, giải quyết triệt để các cột trùng tên và bóc tách bảng Markdown Wiki nhiều dòng.
2. Tự động bóc tách mã dự án (`code`) và tên công việc (`task`) từ `Summary` để ánh xạ vào khung xương mẫu 49 cột của PMO.
3. Trích xuất tự động báo cáo tuần mới nhất từ `Custom field (Progress Report)` để đổ vào cột tuần hiện tại (`currentDone`, `currentPlan`). Nếu chưa có cập nhật tuần mới, tự động lấy tuần gần nhất kèm cờ cảnh báo `stale`.
4. **Quản lý Master Catalog tập trung ở Backend:** Nạp file template mẫu PMO làm Master Catalog gốc, Backend tự động merge Jira data vào catalog và trả về cấu trúc 49 cột hoàn chỉnh cho Frontend.
5. **Quản lý cấu hình ánh xạ (Mapping Configurations):** Cho phép lưu trữ, tải, chỉnh sửa, **nhân bản (clone)**, và tái sử dụng các bộ cấu hình mapping giữa các kỳ báo cáo khác nhau hoặc giữa các phòng ban.
6. **Lưu trữ File & So khớp Tăng dần Thông minh (Storage & Incremental Diff Engine):**
   - Lưu trữ vật lý toàn bộ các file CSV đã upload vào `server/storage/uploads/` phục vụ kiểm toán và tính năng "Lần nhập gần nhất".
   - Tính mã hash SHA-256 để phát hiện tức thì (0ms) các file trùng lặp 100%.
   - So sánh thông minh dựa trên `Issue key` và `Updated` timestamp của Jira: Khi nạp lại file bổ sung trong tuần, chỉ trích xuất các dòng mới hoặc có thay đổi trên Jira, **tuyệt đối bảo toàn các ô người dùng đã sửa tay hoặc duyệt nháp AI trước đó**.
   - Thiết lập giới hạn an toàn kích thước file (> 25MB cảnh báo sai bộ lọc) và sử dụng cơ chế streaming parser để không ngốn RAM.
7. Tích hợp liền mạch với Frontend React: Thay thế việc nạp dữ liệu mock bằng API thật, duy trì toàn bộ trải nghiệm người dùng hiện tại (bước Nhập file → Kiểm tra dữ liệu).

### Ngoài phạm vi (Non-goals)
- Chưa triển khai AI LLM thật để viết nháp nội dung (giữ mock AI ở đợt này, sẽ làm ở đợt tiếp theo).
- Chưa triển khai cơ sở dữ liệu quan hệ phức tạp (PostgreSQL) — sử dụng cấu trúc lưu trữ cấu hình file JSON / SQLite phi tập trung để triển khai nhẹ nhàng, không phụ thuộc hạ tầng nặng.
- Chưa xử lý đồng bộ trực tiếp qua Jira REST API (ở đợt này tập trung vào luồng xuất file CSV từ Jira).

### Tiêu chí chống thất bại (Anti-goals)
- Không làm gãy luồng 4 bước UX mà ứng dụng đã thiết kế.
- Không bắt người dùng phải map thủ công 49 cột từ 277 cột ở mỗi lần import. Mọi mapping thông thường phải chạy tự động 95%, chỉ cảnh báo khi có thay đổi.

---

## 2. Các phương án đã cân nhắc (Approaches)

### Phương án A: Template-Driven Ingestion with Configurable Mapping Engine (ĐƯỢC CHỌN)
- **Mô tả:** Template 49 cột được coi là khung đích (Target Schema). Backend sở hữu bộ từ điển ánh xạ thông minh, tự động nhận diện và ghép các cột Jira quen thuộc vào khung đích. Đồng thời, cấu hình mapping được quản lý dưới dạng các Profile độc lập (có thể lưu, đặt tên, clone, tái sử dụng).
- **Ưu điểm:** Khớp 100% với giao diện hiện tại; xử lý tự động phần lớn công việc tẻ nhạt; cho phép linh hoạt clone cấu hình cho các dự án/mẫu báo cáo khác nhau.
- **Lý do chọn:** Tối ưu hóa UX của PMO, tốc độ xử lý nhanh (<200ms cho file Jira vài trăm dòng).

### Phương án B: Generic Two-Stage ETL Form
- **Mô tả:** User upload file -> Server đọc 277 header -> Bắt user map thủ công toàn bộ 49 cột trên UI -> Bấm Execute ETL.
- **Lý do loại bỏ:** Trải nghiệm người dùng rất nặng nề, làm chậm quy trình báo cáo tuần định kỳ.

### Phương án C: Client-Side Only Parsing (JS)
- **Mô tả:** Xử lý toàn bộ trên trình duyệt không dùng Python.
- **Lý do loại bỏ:** Trình duyệt yếu khi xử lý regex phức tạp và bảng Jira markdown lớn; không đáp ứng yêu cầu kiến trúc kết nối Backend Python và lưu trữ cấu hình lâu dài.

---

## 3. Kiến trúc Chi tiết (Detailed Architecture)

### 3.1. Cấu trúc thư mục Backend (`server/`)
```text
server/
├── requirements.txt           # fastapi, uvicorn, python-multipart, pydantic
├── main.py                    # Khởi tạo FastAPI app, cấu hình CORS & router
├── core/
│   ├── config.py              # Đường dẫn thư mục dữ liệu, settings (max file size, upload dir)
│   └── constants.py           # Định nghĩa 49 cột chuẩn PMO & regex pattern
├── parsers/
│   ├── jira_csv_parser.py     # Đọc CSV 277 cột, xử lý cột trùng, multi-line cells
│   ├── wiki_markdown.py       # Trích xuất bảng Jira Wiki ||*Week*||...
│   └── code_extractor.py      # Regex bóc mã dự án từ Summary
├── services/
│   ├── file_storage_service.py# Quản lý lưu trữ file CSV, tính SHA-256 hash, danh sách lịch sử
│   ├── diff_engine.py         # So sánh incremental diff theo Issue Key + Updated timestamp
│   ├── catalog_service.py     # Quản lý Master Catalog nạp từ template mẫu
│   ├── mapping_service.py     # Quản lý CRUD, Clone, Load Profile cấu hình mapping
│   └── import_service.py      # Điều phối: Parse CSV -> Áp dụng Mapping -> Ghép dòng PMO
├── routers/
│   ├── import_router.py       # Endpoints POST /api/import, GET /api/import/history, GET /api/import/file/{file_id}
│   └── mapping_router.py      # Endpoints /api/mapping-configs (CRUD + Clone)
└── storage/
    ├── uploads/               # Lưu trữ vật lý các file CSV đã nạp ({hash}_{filename}.csv)
    ├── uploads_meta.json      # Metadata các lần nạp (tên file, hash, tuần, người nạp, số issue)
    ├── templates/             # Lưu file template mẫu ban đầu (master_template.csv)
    └── mapping_configs/       # Thư mục lưu các file JSON profile cấu hình
        └── default.json       # Cấu hình chuẩn mặc định ban đầu
```

### 3.2. Cấu trúc Dữ liệu Cấu hình Ánh xạ (`MappingProfile`)
Một profile cấu hình ánh xạ được thiết kế bằng các **khoá ngữ nghĩa động (Dynamic Semantic Keys)** để dùng lại được qua mọi tuần:
```json
{
  "id": "cfg-ksm-ai-default",
  "name": "Cấu hình chuẩn KSM AI (Mặc định)",
  "description": "Ánh xạ từ xuất file Jira PMO sang bảng 49 cột",
  "is_default": true,
  "created_at": "2026-11-18T00:00:00Z",
  "updated_at": "2026-11-18T00:00:00Z",
  "created_by": "PMO Admin",
  "column_mappings": {
    "code": "Summary",
    "task": "Summary",
    "status": "Status",
    "progress": "Custom field (Progress)",
    "lifecycleStepNo": "Custom field (Phase)",
    "lifecycleStep": "Custom field (Phase)",
    "currentDone": "Custom field (Progress Report)",
    "currentPlan": "Custom field (Progress Report)",
    "currentIssues": "Custom field (Risk Notes)",
    "milestone": "Description",
    "pic": "Assignee",
    "po": "Custom field (PO)",
    "due_date": "Due date"
  },
  "value_mappings": {
    "status_map": {
      "IN PROGRESS": "Đang thực hiện",
      "DONE": "Đã hoàn thành",
      "TO DO": "Chưa bắt đầu",
      "PENDING": "Tạm dừng"
    },
    "progress_map": {
      "On-track": "Đúng tiến độ",
      "Off-track": "Chậm tiến độ",
      "At risk": "Có rủi ro"
    },
    "phase_bucket": {
      "1.Xác.định.bài.toán.AI": 1,
      "2.Xác.định.yêu.cầu.nghiệp.vụ.chi.tiết": 2,
      "8.Tích.hợp.Software": 8,
      "10.Đánh.giá.An.ninh.Bảo.mật": 10
    },
    "phase_ignore": {
      "TBD": true
    }
  }
}
```

*Lưu ý:* Khi import với `target_week = "w3"`, Backend tự động phân giải `currentDone` thành `w3Done`, `currentPlan` thành `w3Plan`, `currentIssues` thành `w3Issues`. Nhờ đó, một Profile có thể tái sử dụng vĩnh viễn cho tất cả các tuần mà không cần sửa cấu hình!

### 3.3. Các Quyết định Kỹ thuật Chi tiết đã chốt

1. **Phân định Nguồn Dữ liệu Master Catalog:**
   - Backend quản lý Master Catalog khởi tạo từ file template mẫu `master_template.csv`.
   - Khi import Jira, Backend ghép dữ liệu Jira vào Master Catalog và trả về danh sách `Row[]` 49 cột hoàn chỉnh. Frontend nhận về và đổ thẳng vào Zustand store.
2. **Quy tắc Trích xuất `Progress Report`:**
   - Parser phân tích toàn bộ các block ngày trong bảng markdown Jira Wiki (`||*Week*||...`).
   - Tìm block có ngày trùng hoặc gần nhất với tuần báo cáo. Nếu ngày này cũ hơn tuần báo cáo (ví dụ cập nhật từ 2 tuần trước), hệ thống vẫn điền nội dung vào `w3Done`/`w3Plan` nhưng đánh dấu cờ `stale: true` để Frontend hiển thị cảnh báo màu vàng ở Bước 2.
3. **Cơ chế Định danh Cột Trùng tên:**
   - Mỗi cột trong 277 cột Jira được định danh bằng cặp `(index, name)` (ví dụ: cột thứ 12 là `Assignee`, cột thứ 14 là `Assignee Id`, các cột trùng tên `Custom field (PRD)` lần lượt là index 145, 146, 147).
   - `jira_columns` trả về cho Frontend kèm `index` để giao diện chọn cột có thể phân biệt chính xác.
4. **Luồng Tinh chỉnh Ánh xạ ở Bước 2:**
   - Xử lý in-memory trên Client khi người dùng đổi ánh xạ hoặc đổi quy đổi giá trị để mang lại phản hồi tức thì (0ms latency).
   - Khi người dùng bấm "Lưu cấu hình" hoặc "Nhân bản (Clone) cấu hình", Client gọi API Backend `POST/PUT /api/mapping-configs` để lưu profile vĩnh viễn.
5. **Xung đột Nhiều Issue cùng Mã Dự án:**
   - Khi có nhiều issue cùng có mã dự án (ví dụ 2 task cùng mang tiền tố `II.D.2.1`), Backend gom lại và báo trong `summary_diff.duplicate_codes`.
   - Dữ liệu chuyển sang Bước 2 (Tab Ghép dự án) hiển thị nút "Gộp dòng" hoặc "Tách dòng" theo đúng thiết kế đã có của ứng dụng.

---

### 3.4. Các API Endpoints

#### 1. Quản lý Cấu hình Ánh xạ (`/api/mapping-configs`)
- `GET /api/mapping-configs`: Liệt kê danh sách tất cả cấu hình có sẵn (id, name, description, is_default, updated_at).
- `GET /api/mapping-configs/{id}`: Lấy chi tiết toàn bộ mapping của một cấu hình.
- `POST /api/mapping-configs`: Tạo mới một cấu hình.
- `PUT /api/mapping-configs/{id}`: Cập nhật cấu hình hiện tại.
- `POST /api/mapping-configs/{id}/clone`: **Nhân bản cấu hình** thành bản sao mới (nhận `new_name`, `new_description`).
- `POST /api/mapping-configs/{id}/set-default`: Đặt cấu hình này làm mặc định cho các lần import sau.

#### 2. Nhập Dữ liệu & Lịch sử File (`/api/import`)
- `POST /api/import`: Nhận `multipart/form-data`:
  - `file`: File CSV (bắt buộc)
  - `config_id`: ID của cấu hình muốn áp dụng (tùy chọn; nếu không gửi sẽ dùng cấu hình `is_default`)
  - `target_week`: Tuần báo cáo cần ghi dữ liệu (ví dụ: `w1`, `w2`, `w3`, `w4`, linh hoạt theo tuần đang chọn trên TopBar, không fix cứng)
  - `target_month`: Tháng báo cáo (ví dụ: `2026-11`, `2026-12`, linh hoạt theo tháng đang chọn)
  - `existing_rows`: Chuỗi JSON danh sách các dòng hiện tại trên Client (tùy chọn, dùng để bảo toàn ô đã sửa tay hoặc duyệt nháp khi re-import)
- **Cơ chế xử lý thông minh (Smart Processing):**
  1. Tính hash SHA-256: Nếu trùng 100% với file gần nhất của cùng kỳ báo cáo (`target_month` + `target_week`) -> trả về cờ `is_duplicate: true` kèm thông báo *"File trùng khớp 100% với lần nạp trước của kỳ này"*.
  2. Lưu file vật lý vào `storage/uploads/` và cập nhật `uploads_meta.json` kèm `target_month` và `target_week`.
  3. Incremental Diff: So sánh theo `Issue key` + `Updated`. Chỉ cập nhật các trường động từ Jira cho các issue có thay đổi hoặc mới; giữ nguyên 100% các ô người dùng đã ghi đè (`ovr`) hoặc AI đã duyệt (`ai.ok`).
- **Dữ liệu trả về (Response Payload):**
  - `file_stats`: `{ total_cols: 277, total_issues: 39, dup_groups: 12, loaded_at: "...", file_hash: "...", is_duplicate: false, target_month: "2026-11", target_week: "w3" }`
  - `jira_columns`: Danh sách 277 cột Jira phát hiện được (kèm index, tên, kiểu dữ liệu, sample values).
  - `column_status`: Trạng thái đối chiếu của 49 cột (cột nào khớp tốt, cột nào bị đổi tên, cột nào để trống).
  - `rows`: Danh sách các dòng dữ liệu 49 cột hoàn chỉnh.
  - `diff_summary`: `{ unchanged_count: 35, updated_count: 3, new_count: 1, updated_keys: ["PKD-11"] }`
  - `orphan_issues`: Các issue không bóc tách được mã dự án từ Summary.
  - `new_codes`: Các mã dự án mới xuất hiện trong file Jira nhưng chưa có trong danh mục mẫu.
  - `unmapped_values`: Các giá trị trạng thái/tiến độ mới xuất hiện chưa có trong từ điển quy đổi.
- `GET /api/import/history`: Trả về danh sách các lần nạp gần nhất (tên file, thời gian nạp, tháng, tuần, số issue, số cột, phiên bản liên quan) phục vụ hiển thị trên giao diện "Lần nhập gần nhất".
- `POST /api/import/reapply/{file_id}`: Nạp lại một file trong lịch sử mà không cần tải lại file lên.

---

### 3.5. Tích hợp Frontend (`client/`)

1. **API Client:** Tạo `client/src/api/importApi.ts` và `client/src/api/mappingApi.ts` giao tiếp với proxy `/api`.
2. **Màn hình Nhập File (`views/Import/ImportView.tsx`):**
   - Sự kiện kéo thả / chọn file thật trong `DropZone` sẽ gọi `importApi.uploadJiraFile(file, selectedConfigId, s.targetWeek || 'w3', s.targetMonth || '2026-11')`.
   - Hiển thị tuần và tháng đang chọn, có thể đổi tuần từ TopBar WeekPicker hoặc menu chọn tuần.
   - Hiển thị dropdown chọn Cấu hình ánh xạ trước khi nạp.
   - Nạp dữ liệu thực nhận từ API vào Zustand store (`allRows`, `fields`, `fileStats`, `statusMap`, v.v.).
3. **Màn hình Kiểm tra - Khớp Cột & Quy Đổi (`views/Check/CheckTabs.tsx`):**
   - Tab *Khớp cột*: Hiển thị danh sách 277 cột Jira thực tế trả về từ backend.
   - Thêm nút **"Lưu cấu hình"** và **"Nhân bản (Clone)"** kèm dialog đặt tên để người dùng lưu lại profile mới.

---

## 4. Kế hoạch Kiểm chứng (Verification Plan)
1. **Kiểm thử Unit Backend:**
   - Test parse file CSV sample 277 cột được cung cấp.
   - Kiểm tra bóc tách thành công 2 mã `I.A.5.1` và `II.E.1.2`.
   - Kiểm tra trích xuất đúng nội dung bảng tiến độ `Progress Report` và cờ cảnh báo `stale`.
   - Kiểm thử API CRUD và Clone cấu hình mapping.
2. **Kiểm thử Tích hợp Frontend:**
   - Kéo thả file sample thật trên giao diện web.
   - Xác nhận chuyển đổi mượt mà từ Bước 1 sang Bước 2 với đầy đủ số liệu 277 cột thật và các dòng dự án thật.
   - Thử nghiệm thao tác chỉnh sửa ánh xạ cột và bấm "Clone cấu hình" -> kiểm tra cấu hình mới được lưu và hiển thị trong danh sách profile.

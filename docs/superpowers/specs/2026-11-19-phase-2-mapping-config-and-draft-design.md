# Design Document: Chặng 2 - Hệ thống Cấu hình Mapping Động, Clone/Tái sử dụng & Quản lý Phiên Nháp

- **Ngày cập nhật**: 19/11/2026
- **Trạng thái**: Chờ duyệt (Dự thảo kỹ thuật chi tiết Chặng 2)
- **Mã dự án**: DAN-FL / PMO Reporting Agent
- **Phạm vi**: Backend (`server/`) - Lộ trình 2: Mapping Configuration Engine, Clone/Reuse, Dynamic Recalculate & Session Drafts.
- **Tài liệu tham chiếu gốc**: `docs/superpowers/specs/2026-11-19-modular-pipeline-backend-design.md`

---

## 1. Mục đích & Bối cảnh (Intent & The Why)

Ở Chặng 1, Backend đã hoàn thành Core Ingestion Pipeline với 77 quy tắc mapping kỹ thuật chuẩn của PMO (`rule_engine.py`) và đạt 100% test pass. Tuy nhiên, các quy tắc này hiện đang được khai báo cố định (hardcoded) trong mã nguồn Python.

Thực tế nghiệp vụ PMO đòi hỏi:
1. **Lưu cấu hình mapping bền vững**: Khi Jira đổi tên một cột (ví dụ: `Custom field (Progress %)` đổi thành `Custom field (Progress)`), PMO cần chỉnh sửa nhanh cột nguồn trong cấu hình mà không phải sửa code server.
2. **Nhân bản / Tái sử dụng (Clone & Reuse)**: PMO hoặc các nhóm dự án khác nhau (Mobility, Smart City, Voice AI...) có thể có các biến thể mapping riêng (ví dụ: khác về rổ gom Phase hoặc fallback của PIC). Cần có tính năng clone một cấu hình chuẩn thành bản mới để tinh chỉnh và tái sử dụng cho các tuần sau.
3. **Tính toán lại linh hoạt (Recalculate)**: Khi người dùng áp dụng một cấu hình mapping mới hoặc gán mã DA cho các issue mồ côi (`orphans` như `PKD-202`), Backend có thể tính toán lại toàn bộ bảng 49 cột ngay trên phiên nạp mà không cần upload lại file từ đầu.
4. **Lưu nháp phiên làm việc (Session Drafts & Overrides)**: Lưu trữ các ô người dùng đã sửa tay (`overrides`) và nhật ký thay đổi (`AuditLog`) để hỗ trợ kiểm thử xuyên suốt qua Postman trước khi bước sang Chặng 3 (Chốt phiên bản & Xuất file Excel).

---

## 2. Mục tiêu, Giới hạn & Chống mục tiêu (Goals, Non-Goals, Anti-Goals)

### 2.1. Mục tiêu (Goals)
- Xây dựng model `MappingConfig` trong SQLite, tự động khởi tạo (seed) cấu hình mặc định mang mã `map_default_pmo_49col` khớp 100% với 77 rules của Chặng 1.
- Cung cấp đầy đủ bộ REST API CRUD cho Mapping:
  - `GET /api/v1/mappings`: Danh sách cấu hình.
  - `GET /api/v1/mappings/{id}`: Chi tiết cấu hình (các cột, fallback, quy đổi giá trị).
  - `POST /api/v1/mappings`: Tạo cấu hình mới.
  - `POST /api/v1/mappings/{id}/clone`: **Nhân bản / Clone** cấu hình sẵn có thành bản sao độc lập.
  - `PUT /api/v1/mappings/{id}`: Cập nhật chỉnh sửa nhỏ.
  - `DELETE /api/v1/mappings/{id}`: Lưu trữ hoặc xoá cấu hình không mặc định.
  - `POST /api/v1/mappings/{id}/set-default`: Đặt làm cấu hình mặc định cho hệ thống.
- Cập nhật `rule_engine.py` để hỗ trợ nạp cấu hình động từ `MappingConfig`.
- Endpoint `POST /api/v1/mapping/recalculate`: Áp dụng cấu hình mới hoặc gán orphan issue vào phiên nạp hiện tại, tính toán lại dữ liệu và bảo toàn các ô `overrides`.
- Endpoint `PUT /api/v1/sessions/{session_id}/draft` & `GET /api/v1/sessions/{session_id}/draft`: Lưu nháp và lấy lại nháp kèm danh sách `audit_logs`.
- Toàn bộ tính năng có thể kiểm thử độc lập 100% qua Postman / cURL.

### 2.2. Giới hạn (Non-Goals)
- Chưa tích hợp giao diện Frontend React (sẽ tích hợp sau khi backend hoàn tất trọn vẹn).
- Chưa triển khai Chốt phiên bản bất biến (`Version Lock`) và Xuất file `.xlsx` bằng `openpyxl` (thuộc Chặng 3).
- Không tự động đẩy cấu hình ngược lại Jira REST API.

### 2.3. Chống mục tiêu (Anti-Goals)
- Không làm gãy luồng Ingestion của Chặng 1: Mọi endpoint upload cũ (`/ingest/upload`, `/ingest/demo`) vẫn chạy bình thường với cấu hình mặc định nếu người dùng không truyền `mapping_id`.
- Không làm mất các ô người dùng đã sửa tay (`overrides`) khi chạy `recalculate`.

---

## 3. Kiến trúc Dữ liệu & Thiết kế Kỹ thuật

### 3.1. Mô hình Dữ liệu SQLite (`server/app/models/mapping.py`)

```python
class MappingConfig(Base):
    __tablename__ = "mapping_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True)         # vd: map_default_pmo_49col
    name: Mapped[str] = mapped_column(String, nullable=False)        # vd: "Mẫu 49 cột chuẩn PMO"
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="active")    # active, draft, archived
    version: Mapped[int] = mapped_column(Integer, default=1)
    
    # Cấu hình ánh xạ cột (A đến AW): List[MappingColumnDef]
    columns_json: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Bảng quy đổi giá trị: status_map, prog_map, phase_map
    value_mappings_json: Mapped[str] = mapped_column(Text, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    created_by: Mapped[str] = mapped_column(String, default="PMO System")
```

### 3.2. Cấu trúc JSON của Cột Ánh xạ (`columns_json`)
Mỗi cột trong danh sách bao gồm:
```json
[
  {
    "field_id": "pic",
    "col_letter": "F",
    "name": "Đầu mối chịu trách nhiệm",
    "source_type": "jira",
    "source_field": "Assignee",
    "fallbacks": ["Custom field (PO)", "Custom field (Tech lead)"],
    "required": true
  },
  {
    "field_id": "status",
    "col_letter": "I",
    "name": "Trạng thái",
    "source_type": "jira",
    "source_field": "Status",
    "fallbacks": [],
    "required": true
  }
]
```

### 3.3. Cấu trúc JSON của Quy đổi Giá trị (`value_mappings_json`)
```json
{
  "status_map": {
    "To Do": "Chưa bắt đầu",
    "Open": "Chưa bắt đầu",
    "In Progress": "Đang thực hiện",
    "Resolved": "Đã hoàn thành",
    "Closed": "Đã hoàn thành",
    "Hold": "Tạm dừng"
  },
  "progress_map": {
    "On-track": "Đúng tiến độ",
    "Delayed": "Chậm tiến độ",
    "At Risk": "Có rủi ro"
  },
  "phase_map": {
    "1": "1. Khảo sát & Đánh giá bài toán",
    "4": "4. Phát triển mô hình AI"
  }
}
```

### 3.4. Mô hình Dữ liệu Lưu nháp (`SessionDraft` trong `server/app/models/session.py`)
```python
class SessionDraft(Base):
    __tablename__ = "session_drafts"

    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    cycle_id: Mapped[str] = mapped_column(String, index=True)
    mapping_id: Mapped[str] = mapped_column(String, nullable=True)
    rows_json: Mapped[str] = mapped_column(Text)            # Dữ liệu bảng 49 cột hiện tại
    overrides_json: Mapped[str] = mapped_column(Text)       # Dict: { ma_da: { field: new_value } }
    audit_logs_json: Mapped[str] = mapped_column(Text)      # List: [ { at, field, old_val, new_val, by } ]
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
```

---

## 4. Chi tiết Đặc tả Hợp đồng API (API Contracts)

### 4.1. Nhóm Quản lý Cấu hình Mapping (`/api/v1/mappings`)

1. **`GET /api/v1/mappings`**:
   - Trả về danh sách tất cả các cấu hình mapping có trong hệ thống.
   - Response: `[{ "id": "map_default_pmo_49col", "name": "Mẫu 49 cột chuẩn PMO", "is_default": true, "version": 1, ... }]`.

2. **`GET /api/v1/mappings/{id}`**:
   - Trả về đầy đủ cấu trúc chi tiết của một cấu hình: danh sách các cột (`columns`) và từ điển quy đổi (`value_mappings`).

3. **`POST /api/v1/mappings`**:
   - Tạo mới một cấu hình mapping từ body JSON.

4. **`POST /api/v1/mappings/{id}/clone`**:
   - **Tác vụ**: Đọc cấu hình `{id}`, tạo bản sao mới với:
     - `id`: `map_clone_{timestamp}_{short_hash}`
     - `name`: `"{origin_name} (Bản sao)"`
     - `is_default`: `false`
     - `status`: `"draft"`
   - Response: Trả về toàn bộ thông tin của cấu hình mới được clone.

5. **`PUT /api/v1/mappings/{id}`**:
   - Cập nhật chỉnh sửa nhỏ: đổi tên cột Jira nguồn của 1 vài cột, thêm một quy tắc quy đổi status/progress mới. Tự động tăng `version += 1`.

6. **`DELETE /api/v1/mappings/{id}`**:
   - Xoá cấu hình. Nếu cấu hình đang là `is_default=True`, chặn trả về lỗi `400 E_CANNOT_DELETE_DEFAULT_MAPPING`.

7. **`POST /api/v1/mappings/{id}/set-default`**:
   - Đặt cấu hình `{id}` làm mặc định của hệ thống (chuyển các cấu hình khác thành `is_default=False`).

---

### 4.2. Nhóm Tính toán lại & Lưu nháp Session

1. **`POST /api/v1/mapping/recalculate`**:
   - **Request**:
     ```json
     {
       "session_id": "sess_20261119_abc123",
       "mapping_id": "map_clone_171029",
       "orphan_assignments": [
         { "key": "PKD-202", "target_ma_da": "I.C.1.2" }
       ],
       "overrides": {
         "I.C.1.2": { "pic": "Nguyễn Văn Chuyên Viên" }
       }
     }
     ```
   - **Xử lý**:
     - Lấy lại `source_rows_json` của `session_id`.
     - Chạy lại pipeline mapping theo `MappingConfig` được chỉ định.
     - Gắn orphan issue `PKD-202` vào `I.C.1.2.subtasks`, loại bỏ `PKD-202` khỏi mảng `orphans`, xóa blocker `E_NO_CODE`.
     - Áp dụng các ô `overrides` lên bảng kết quả.
   - **Response**: Trả về `IngestResponse` mới với `rows`, `orphans`, `blockers`, `warnings` đã được tính toán lại.

2. **`PUT /api/v1/sessions/{session_id}/draft`**:
   - **Request**: Lưu trạng thái `rows`, `overrides`, và `audit_logs`.
   - **Response**: `{ "success": true, "session_id": "...", "updated_at": "2026-11-19T22:30:00" }`.

3. **`GET /api/v1/sessions/{session_id}/draft`**:
   - **Response**: Trả về dữ liệu nháp mới nhất đã lưu của session.

---

## 5. Quy trình Kiểm thử qua Postman

Người dùng có thể dùng Postman kiểm thử một mạch tuần tự:
1. `GET /api/v1/mappings` $\rightarrow$ Thấy mẫu `map_default_pmo_49col` có sẵn.
2. `POST /api/v1/mappings/map_default_pmo_49col/clone` $\rightarrow$ Tạo được mẫu clone mới `map_clone_...`.
3. `PUT /api/v1/mappings/{new_id}` $\rightarrow$ Sửa một quy tắc (ví dụ: đổi mapping Status `Pending` $\rightarrow$ `Tạm dừng`).
4. `POST /api/v1/ingest/demo` $\rightarrow$ Nạp 19 issues Golden Dataset, lấy được `session_id`.
5. `POST /api/v1/mapping/recalculate` $\rightarrow$ Truyền `session_id` + `mapping_id` vừa sửa + gán `PKD-202` vào `I.C.1.2` $\rightarrow$ Bảng tự động cập nhật, `E_NO_CODE` biến mất.
6. `PUT /api/v1/sessions/{session_id}/draft` $\rightarrow$ Lưu nháp ô sửa tay.
7. `GET /api/v1/sessions/{session_id}/draft` $\rightarrow$ Lấy lại nháp đầy đủ.

---

## 6. Những điểm giao cho Người lập trình (What's left to the builder)
1. **Khởi tạo dữ liệu mẫu (Seed script)**: Builder tạo một migration hoặc logic khởi động trong `main.py` để tự động nạp `map_default_pmo_49col` vào bảng `mapping_configs` nếu database trống.
2. **Quy tắc sinh ID clone**: Sử dụng uuid4 hoặc slug tên + timestamp để sinh ID không trùng lặp khi clone mapping.
3. **Audit Log Format**: Chuẩn hoá format mỗi record audit log gồm: `timestamp`, `ma_da`, `field`, `old_val`, `new_val`, `user`.

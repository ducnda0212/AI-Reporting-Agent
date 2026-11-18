# Client — PMO Reporting (React + Vite + TypeScript)

Giao diện báo cáo PMO: nhập file Jira, kiểm tra dữ liệu, điền & duyệt (có AI soạn nháp), chốt phiên bản và xuất báo cáo PDF/Word.
Đây là bản port từ prototype HTML một file sang React. Hiện chạy hoàn toàn bằng **dữ liệu mock** ở phía client; backend chưa nối.

## Chạy

```bash
cd client
npm install
npm run dev        # http://localhost:5173
```

## Công nghệ

React 18, TypeScript (strict), Vite 5, zustand + immer (state), vitest. Không dùng thư viện UI; CSS thuần, class dùng chung.

## Cấu trúc thư mục

```
client/
├─ index.html, vite.config.ts, tsconfig.json   # alias "@" -> src
├─ public/logo.png                             # logo + favicon
├─ docs/screenshots/                           # ảnh dùng trong README này
└─ src/
   ├─ main.tsx, App.tsx
   ├─ types/        kiểu dùng chung (Row, Field, Catalog, ...)
   ├─ data/         mock: demo.json, constants.ts, seed.ts, tour.ts, risk.ts (bộ tiêu chí + 8 ca rủi ro), templates.ts (thư viện mẫu báo cáo)
   ├─ lib/          hàm thuần (cell, check, selectors, exec, grid, risk, theme, export/docx|pdf|docHtml)
   ├─ store/        zustand: types.ts (AppState), index.ts, actions/ (flow, grid, catalog, exportReport, risk, templates)
   ├─ hooks/        useDerived, useGridKeyboard, useColResize
   ├─ components/   layout/ grid/ panels/ modals/ layers/ common/
   ├─ views/        Import, Check, Template, TemplateLib, Exec, Risk, Catalog, Versions, Log
   ├─ styles/       *.css (global, giữ class gốc của prototype)
   └─ __tests__/    smoke + flows
```

## Những việc đã làm

### 1. Tổ chức lại repo
- Chuyển toàn bộ code giao diện vào `client/` (trước nằm ở `src/`). Alias `@` trỏ `client/src`.
- Tách `client/` và `server/` độc lập, mỗi bên có `package.json`/`node_modules` riêng (server dự kiến Python). Không dùng npm workspaces.
- Thêm proxy `/api` -> `127.0.0.1:8000` trong `vite.config.ts` để gọi backend lúc dev mà không dính CORS.

### 2. Chuẩn convention: đổi tên field sang tiếng Anh
Toàn bộ field id / biến tiếng Việt không dấu được đổi sang tiếng Anh (cột Excel `col` giữ nguyên). Kiểm chứng bằng cách so snapshot dữ liệu seed trước/sau khi đổi: giống hệt (sau khi map khoá).

| Cũ | Mới | Cũ | Mới |
|---|---|---|---|
| `ma` | `code` | `giatri` | `businessValue` |
| `viec` | `task` | `rui` | `riskLevel` |
| `mang` | `workstream` | `loai` | `projectType` |
| `muctieu` | `objective` | `buoc` | `lifecycleStep` |
| `tt` | `status` | `buocso` | `lifecycleStepNo` |
| `td` | `progress` | `uoctinh` | `valueEstimate` |
| `gdk` | `divisionHead` (GĐK QLTT) | `nextstep` | `nextStep` |
| `phong` | `department` | `aieng` / `airs` | `aiEngineer` / `aiResearcher` |
| `tp` | `deptHead` (Trưởng phòng) | `mlops` / `swe` | `mlopsEngineer` / `softwareEngineer` |
| `bo` | `businessOwner` | `tt1` | `statusAlt` (cột AA, "TRẠNG THÁI 1") |
| `caitien` | `initiativeType` | `w{1,2,4}{ht,kh,vd}` | `w{n}{Done,Plan,Issues}` |
| `ht` / `kh` / `vd` (tuần 3) | `w3Done` / `w3Plan` / `w3Issues` | `kq` / `cd` | `kpiResult` / `directive` |

Đổi tên khác: `pinViec`→`pinTask`, `exTT`→`exStatus`, `vdReal`→`hasIssues`, `MAN3`→`LEVELS`, `PHONG_OF`→`DEPARTMENT_OF`.
Tên `divisionHead`, `deptHead`, `statusAlt` là suy đoán từ nhãn cột — cần team xác nhận.
Class CSS (`.ma`, `.cd`, `.tt`...) giữ nguyên, chưa đổi.

**Lưu ý tương thích:** khoá localStorage đã tăng phiên bản (`pmo-sys-v3`, `pmo-proto-cfg-v2`, `pmo-proto-cols-v5`) vì dữ liệu lưu cũ dùng id cũ; cấu hình đã lưu trước đó sẽ bị bỏ.

### 3. Sửa lỗi cấu hình
- Thêm `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) để import `.css` không báo lỗi "Cannot find module".
- Bỏ `baseUrl` và `ignoreDeprecations` khỏi `tsconfig.json` (giá trị `"6.0"` không hợp lệ với TS 5.9). `paths` dùng `./src/*`.

### 4. Đồng bộ với prototype mới (v44–v52)
Prototype được cập nhật; client chuyển các thay đổi sang React (dữ liệu mock giữ nguyên, đã đối chiếu với `DEMO` của prototype).

**Từ v44–v47**
- **Màn "Rủi ro" (v46)** — `views/Risk/RiskView.tsx`, mục "Rủi ro" trên thanh trái (huy hiệu = số ca chưa duyệt).
  AI chấm 8 vấn đề/rủi ro theo Bộ tiêu chí v1; người duyệt Đồng ý / Bỏ / Sửa (bắt buộc ghi lý do) / Hoàn tác, mọi thao tác ghi vào Nhật ký.
  Điểm do hệ thống tính ở `lib/risk.ts` (hàm thuần, có test): Impact = mức cao nhất của 5 khía cạnh, Urgency theo số ngày đến hạn ± điều chỉnh, Điểm = Impact × Urgency → P1–P4 và màu Đỏ/Vàng/Xanh/Lưu ý dữ liệu.
- **Đổi giao diện sáng/tối (v47)** — nút ở thanh trên, lưu `pmo-theme`, gắn `data-theme` lên `<html>` (`lib/theme.ts`).
- **Màn Nhập file (v44–v45)** — tóm tắt chữ lớn, "Đã sẵn sàng" là danh sách có biểu tượng loại file và mũi tên `›`.

**Mới ở v48–v52**
- **Logo ảnh + favicon (v48)** — `public/logo.png` thay logo SVG cũ; biểu tượng nét mảnh `Ico` cho 4 mục Kiểm tra (khớp cột / quy đổi / làm sạch / ghép dự án) và 10 nhóm rủi ro C1–C10; nhãn file `FileTag` (PDF/Word/Excel) dùng trong hộp Xuất và thư viện mẫu (`components/common/Icons.tsx`).
  Menu bên trái của bước Kiểm tra và dòng "Còn lại ở bước Kiểm tra" ở màn Nhập file dùng biểu tượng thay cho số tròn.
- **Chọn kỳ báo cáo (v49)** — thay ô `<select>` bằng nút lùi/tới + bảng chọn tuần có trạng thái (Đang làm / Đã chốt vN / Chưa mở); tuần đã chốt chỉ để xem (mở màn Phiên bản), có link "Lịch sử phiên bản". `TopBar.tsx` → `WeekPicker`, dữ liệu tuần ở `WEEKS` (`data/constants.ts`).
- **Màn "Đang đọc file" (v50)** — các bước dọc có kết quả từng bước, cột phải hiện dần số đã tìm thấy (skeleton rồi số), nút "Huỷ, chọn file khác". `views/Import/ImportView.tsx` → `Importing`.
- **Thư viện mẫu báo cáo (v51)** — mục "Mẫu BC" (thay mục "Cấu hình" cuối thanh trái): mẫu đang dùng cho tuần, bảng tất cả mẫu có lọc Tất cả/Đang dùng/Nháp/Lưu trữ + tìm kiếm, menu thao tác (Mở / Nhân bản / Dùng cho tuần này / Lưu trữ / Khôi phục) và "+ Tạo mẫu mới".
  Mở mẫu chi tiết → màn cấu hình cột, mẫu điều hành → màn Điều hành, mẫu nháp/lưu trữ → màn xem cấu trúc. `views/TemplateLib/`, state `tpls/tlFlt/tlQ/tlDraft`, action `store/actions/templates.ts`, dữ liệu `data/templates.ts`.
- **Cấu hình mẫu 49 cột (v52)** — viết lại gọn: breadcrumb, vòng tiến độ "x/13 cột bắt buộc đã đủ", 4 thẻ thông tin, chip lọc theo cách điền (có biểu tượng + màu), ô tìm, nút "Xem cột còn thiếu", bảng 5 cột, khối "Chờ xác nhận với PMO". `views/Template/TemplateView.tsx`, state `tpK/tpMiss/tpQ`.
- **Bỏ những phần prototype mới không còn** — các dòng phụ đề mô tả ở màn Nhật ký, Phiên bản, Hệ thống, Điều hành (cả ghi chú cuối trang), các ghi chú dưới tab Kiểm tra, ghi chú trong hộp Rổ gom / Yêu cầu sửa / ánh xạ cột, dòng phím tắt ở chế độ duyệt từng ô, ghi chú ở hướng dẫn xuất Jira, ghi chú cuối bản PDF điều hành, mục "Cấu hình" trên thanh trái và biểu tượng của nó.
- **Sửa lỗi bố cục** — thêm `#root{height:100%}` (client bọc app trong `#root`, prototype thì không) nên trước đây trang dài đẩy mục cuối thanh trái ra khỏi màn hình.
- 226 rule CSS mới nằm ở `styles/refine-v2.css` (import cuối cùng, chỉ thêm). Các rule bản cũ giữ nguyên, rule mới ghi đè theo thứ tự nạp.
- Đối chiếu bằng cách so toàn bộ class CSS và chuỗi giao diện của prototype với `client/src`: không còn class CSS nào chỉ có ở một bên; chuỗi giao diện còn lệch chỉ là code chết của prototype (màn nhập/kiểm tra cũ) hoặc nhiễu do cách tách chuỗi.
- Bước hướng dẫn "Phiên bản" vẫn dùng `.rail .ri:nth-child(4)`; bước "Cấu hình cột" dùng `.cfgchip` (nay là mục "Mẫu BC").

## Màn hình

Ảnh chụp ở 1440×900, giao diện sáng. Nút "Dùng dữ liệu mẫu" đã bỏ: bước 1 nhập file CSV Jira thật qua backend (`python -m uvicorn server.main:app --port 8000`). Các màn sau bước 1 vẫn dùng dữ liệu mock. Lưu ý: ảnh `01-import-empty.png` và `03-import-loaded.png` chụp trước khi bỏ nút mẫu, cần chụp lại.

### Bước 1 · Nhập file
Kéo thả hoặc chọn CSV Jira cho kỳ đang chọn ở thanh trên; file được gửi lên backend, lưu lại, kiểm tra trùng (SHA-256) và đọc số cột/issue/nhóm cột trùng thật. Cột "Lần nhập gần nhất" lấy từ lịch sử backend.

![Nhập file — trống](docs/screenshots/01-import-empty.png)

Đang đọc file: các bước có kết quả, bên phải hiện dần những gì đã tìm thấy.

![Nhập file — đang đọc](docs/screenshots/02-import-reading.png)

Sau khi nạp file thật: chỉ hiện số liệu thật (số issue, số cột, nhóm cột trùng, cảnh báo file trùng, so với lần nhập trước). Ghép vào mẫu 49 cột, mã mới/biến mất và đổi tên cột chưa có (Đợt 2), nên các dòng đó ẩn; chúng chỉ hiện ở luồng hướng dẫn/mẫu.

![Nhập file — đã nạp](docs/screenshots/03-import-loaded.png)

### Bước 2 · Kiểm tra dữ liệu
Gồm 4 tab con: khớp cột Jira với mẫu, quy đổi giá trị, làm sạch nội dung, ghép dự án.

![Khớp cột](docs/screenshots/04-check-columns.png)
![Quy đổi giá trị](docs/screenshots/05-check-values.png)
![Làm sạch nội dung](docs/screenshots/06-check-clean.png)
![Ghép dự án](docs/screenshots/07-check-projects.png)

### Bước 3 · Điền & duyệt
Bảng 49 cột (sửa trực tiếp, tìm, lọc, kéo cột, menu chuột phải, duyệt nháp AI từng ô).

![Bảng 49 cột](docs/screenshots/08-grid.png)

Báo cáo điều hành: xem trước như file PDF, có thể nhờ AI soạn nội dung.

![Điều hành](docs/screenshots/09-exec.png)

### Rủi ro
Danh sách vấn đề do AI chấm, lọc theo mức; chi tiết gồm phân loại, điểm, dấu hiệu, action đề xuất, ca mẫu tương tự.

![Rủi ro](docs/screenshots/10-risk.png)

Sửa kết quả của AI (bắt buộc ghi lý do) và giao diện tối (nút mặt trăng/mặt trời ở thanh trên):

![Rủi ro — sửa kết quả AI](docs/screenshots/17-risk-edit.png)
![Rủi ro — giao diện tối](docs/screenshots/18-risk-dark.png)

### Mẫu báo cáo
Thư viện mẫu (mục "Mẫu BC" cuối thanh trái) và màn cấu hình mẫu 49 cột của mẫu mặc định.

![Thư viện mẫu báo cáo](docs/screenshots/14-templates.png)
![Cấu hình mẫu 49 cột](docs/screenshots/15-template-config.png)

### Chọn kỳ báo cáo
Nút lùi/tới và bảng chọn tuần ở thanh trên (chọn được Tuần 4); tuần đã chốt chỉ để xem. Kỳ đang chọn (`activeWeek`/`activeMonth` trong store) là kỳ của file Jira khi nhập: màn Nhập file hiển thị "Nhập file Jira cho Tuần 4 tháng 11", upload gửi `target_month`/`target_week`, lịch sử lọc theo tháng.

![Chọn tuần](docs/screenshots/16-week-picker.png)

### Các màn phụ

![Phiên bản](docs/screenshots/11-versions.png)
![Nhật ký](docs/screenshots/12-log.png)
![Hệ thống (danh mục)](docs/screenshots/13-catalog.png)

### Bước 4 · Chốt & xuất
Kiểm tra trước khi chốt, chốt thành phiên bản, rồi xuất file.

![Chốt & xuất](docs/screenshots/19-export.png)

## Trạng thái và hạn chế đã biết
- Mọi dữ liệu là mock (`src/data/`). Việc nối backend sẽ làm sau, bắt đầu từ màn Nhập file.
- `useAppState()` đăng ký cả store nên vẽ lại rộng mỗi lần đổi; ổn với ~40 dòng, cần selector hẹp nếu dữ liệu lớn.
- Còn nhiều biến một chữ cái và viết tắt (`r`, `cr`, `flt`, `iss`...) chưa được đổi tên.
- Hoạt ảnh phụ của bản gốc chưa port (chuyển view, đếm số, nảy badge). "Excel theo mẫu" (.xlsx) mới ghi nhật ký, chưa tạo file.
- Console có 1 lỗi 404 tài nguyên (chưa xác định nguồn; có thể là favicon).

## Nhập file Jira thật (backend)
Màn Nhập file gửi file CSV thật tới FastAPI (`POST /api/import/upload`), hiện số cột/issue/nhóm cột trùng thật, cảnh báo khi file trùng, và "Lần nhập gần nhất" lấy từ `GET /api/import/history` (nhập lại: `GET /api/import/history/{id}`). Chỉ nhận `.csv`; lỗi backend/400 hiện bằng toast.
Chạy backend từ thư mục gốc repo: `server/.venv/Scripts/uvicorn server.main:app --port 8000` (Vite proxy `/api` -> `127.0.0.1:8000`), rồi `npm run dev` trong `client/`.
Lưu ý: các bước sau (Kiểm tra, lưới 49 cột) vẫn dùng dữ liệu seed/demo; ánh xạ cột thật là Đợt 2.

## Quy ước làm việc (cho PR)
- Mỗi thay đổi kèm cập nhật tài liệu: mục "Những việc đã làm" trong README này (hoặc file trong `docs/`), và chụp lại ảnh màn hình nếu giao diện đổi.
- Tên biến/hàm/field bằng tiếng Anh; chuỗi hiển thị cho người dùng giữ tiếng Việt.

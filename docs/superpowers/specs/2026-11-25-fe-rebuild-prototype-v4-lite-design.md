# Tài liệu thiết kế: Xây dựng lại từ đầu Frontend PMO Reporting (Clean Rebuild theo Prototype v4 Lite)

- **Ngày tạo:** 2026-11-25
- **Trạng thái:** Đã qua Builder Check · Chờ bạn phê duyệt để lập Plan
- **Nguồn đối chiếu duy nhất (Source of Truth):** [PMO Reporting Prototype v4 (Copy).html](file:///d:/.2_VinSmart%20Future/AI-Reporting-Agent/docs/superpowers/prototype/PMO%20Reporting%20Prototype%20v4%20(Copy).html) (phiên bản 12.571 dòng đã áp dụng chế độ Bản gọn `html.lite` cùng toàn bộ Vòng góp ý UI 1–10).

---

## 1. Bối cảnh & Mục tiêu (Intent & Why)

Repo hiện tại (`feat/convert-prototype`, commit `8bd5f89`) đang chứa codebase React cũ tại `client/src/` được port từ bản prototype trước đó. Prototype mới tại `docs/superpowers/prototype/PMO Reporting Prototype v4 (Copy).html` đã thay đổi rất sâu:
- Bật **chế độ Bản gọn (`html.lite`)**: ẩn toàn bộ các màn/panel ngoài lõi để tập trung vào luồng **3 bước** trên Header (`Nhập file → Bảng · điền & duyệt → Chốt & xuất`) và **3 mục** trên thanh Rail trái (`Bảng`, `Phiên bản`, `Nhật ký`).
- Bổ sung hàng loạt trải nghiệm mới (Vòng góp ý 1–10): Dropdown 1 chạm `#pkPop`, nút ẩn/hiện `Khối cột` trong menu Cột, nút `✦ AI` trên thanh công cụ với màn chào `ai9` + bảng xem trước thay đổi `stg` + con trỏ `✦ Agent` đi từng ô (`agWalk`), khung giải trình `AI Trace` (`panelTrace`), màn chi tiết dự án 2 cột kéo vách chia (`pa-box`), màn Phiên bản với biểu đồ SVG so sánh 2 bản (`vbBlock`) & sửa tiếp bản cũ, Nhật ký dạng Audit Log (`Toggl`), Trung tâm hướng dẫn (`helpHTML` + multi-tour spotlight), kéo mép ô đổi rộng cột/cao dòng, `Zoom` bảng `50%–200%`, `Ctrl+Z` / `Ctrl+Y` hoàn tác, lịch sử điều hướng `Alt+←` / `Alt+→`.

Thay vì vá chắp nối trên code FE cũ (dễ phát sinh lỗi lệch schema, CSS/state xung đột), người dùng yêu cầu:
1. **Xóa sạch toàn bộ code FE cũ** trong `client/src/` (chỉ giữ khung dự án `client/`: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/logo.png`, `src/vite-env.d.ts`).
2. **Xây dựng lại từ đầu (Clean Rebuild)** theo **Phương án A (Lite Core Parity)**: chỉ code đúng 100% những gì đang hiển thị và hoạt động ở Bản gọn (`lite`), không port lại các phần đã bị ẩn để đảm bảo code sạch, không dư thừa.

---

## 2. Mục tiêu, Phi mục tiêu & Ràng buộc (Goals, Non-goals, Constraints)

### Goals
1. **Giống y hệt Prototype mới (1:1 Visual & Functional Parity)**: Mọi màn hình, bảng 49 cột, thanh công cụ, popup, panel AI, animation, phím tắt, màu sắc sáng/tối và nội dung mock khớp hoàn toàn với phiên bản cuối (sau khi áp dụng mọi override trong file HTML).
2. **Kiến trúc React + TypeScript + Zustand sạch**: Không bọc iframe hay HTML thô; sử dụng React 18, TypeScript strict, Zustand + Immer, CSS thuần trích xuất chuẩn xác từ prototype.
3. **Không mang rác từ bản cũ**: Xóa hoàn toàn code cũ trong `client/src/`. Không viết code cho các phần bị ẩn ở bản `lite`: `Kiểm tra dữ liệu (check)`, `Điều hành (exec)`, `Rủi ro (rid)`, `Hệ thống (cat)`, `Mẫu BC (tlib)`, `Cảnh báo (issues)`, `Ghi chú (note)`, `Rổ gom (buckets)`, và xuất Word/PDF điều hành.

### Non-goals
- Không kết nối backend API thật; dữ liệu chạy 100% mock/localStorage giống prototype (`pmo-proto-store-v1`, `pmo-proto-grid-v1`, `pmo-po-sidew`, `pmo-po-fz`, `pmo-proto-imphist-v1`, `pmo-proto-panel-v1`, `pmo-theme`, `pmo-tour-ver`).
- Không dùng thư viện UI bên ngoài (không AntD, MUI, Tailwind).

### Constraints
- Giữ nguyên môi trường trong `client/package.json` (`react`, `react-dom`, `zustand`, `immer`, `typescript`, `vite`, `vitest`).
- **Chỉ dùng `npm --prefix client run typecheck`, `npm --prefix client test`, và `npm --prefix client run dev`; tuyệt đối KHÔNG chạy `npm run build`.**
- **Không thao tác Git / GitHub trừ thao tác đọc:** Chỉ được dùng các lệnh đọc như `git status`, `git diff`, `git log`; tuyệt đối không thực hiện `git add`, `git commit`, `git push`, `git checkout`, `git reset`, `gh pr`, hay bất kỳ thao tác ghi nào lên git/GitHub.
- Nếu cần hỗ trợ thư viện đọc/ghi `.xlsx` giống prototype (hoặc xuất XML SpreadsheetML/OOXML `.xlsx` thuần JS như hàm tạo Excel trong prototype), ưu tiên dùng đúng logic thuần JS có sẵn trong prototype để không thêm dependency thừa. *(Quyết định của kiến trúc sư: tái sử dụng logic đọc CSV/XLSX và xuất `.xlsx` OOXML thuần trong prototype).*

---

## 3. Các hướng tiếp cận đã cân nhắc (Approaches)

| Phương án | Mô tả | Đánh giá |
|---|---|---|
| **Phương án A: Clean Rebuild chỉ theo Bản gọn (`lite`) — ĐÃ CHỌN** | Xóa sạch `client/src/`, chỉ xây dựng đúng 100% các màn hình, panel, modal đang thực sự hiển thị và hoạt động ở trạng thái cuối của prototype (`html.lite` + Vòng góp ý 1–10). | Code gọn nhẹ, không có dead code, không lãng phí công sức cho các phần đã bị prototype ẩn đi, khớp y hệt trải nghiệm prototype mới. |
| Phương án B: Rebuild kèm các màn ẩn (`exec`, `rid`, `cat`, `tlib`, `issues`, `note`, `buckets`, Word/PDF) | Port cả những phần cũ đang bị `.lite { display: none }` trong file HTML. | Tạo lượng lớn mã chết không được dùng, làm phình kích thước plan & codebase trái với mục tiêu gọn của prototype mới. (Loại) |
| Phương án C: Sửa dần trên FE cũ | Chỉnh sửa trực tiếp trên các file `client/src/` cũ. | Đã thử trước đó và nhiều nợ kỹ thuật/xung đột tên trường, không đạt yêu cầu làm sạch từ đầu. (Loại) |

---

## 4. Đặc tả chi tiết các khối tính năng cần xây dựng lại

### 4.1. Khung vỏ ứng dụng & Điều hướng (App Shell, Header, Rail, Status Bar)
- **TopBar (`48px`..`52px`)**:
  - Bên trái: Logo (`logo.png`) + `PMO Reporting`, cụm nút điều hướng lịch sử `<span class="tnav">` (`←` Quay lại / `→` Tiến tới kèm phím tắt `Alt+←` / `Alt+→`, lưu stack tối đa 50 trạng thái của `view`, `vlView`, `verSel`, `vlA`, `vlB`, `panel`, `vhSel`, `vhCmp`).
  - Chọn tuần (`WeekPicker`): Ẩn tự động khi đang ở màn Nhập file (`.onimp .wkp { display: none }`). Hiển thị tuần hiện tại `Tuần 3/11 · 15–22/11` và các tuần trước `w2`, `w1`.
  - **Thanh 3 bước (`nav.tsteps`)**:
    1. `Nhập file` (`stepGo(1)`, done khi `loaded === true`).
    2. `Bảng · điền & duyệt` (`stepGo(3)`, hiển thị số `2`, badge đếm `fillCount()` khi đang làm, done khi `fillCount() === 0`).
    3. `Chốt & xuất` (`stepGo(4)`, hiển thị số `3`, mở modal Chốt & Xuất).
  - Bên phải:
    - Nút `Dữ liệu thử` (`testMenu`): Đóng/mở menu chọn kịch bản test (`dirty`: Jira bẩn định dạng, `risk`: Nhiều rủi ro, `perfect`: File Jira mẫu Clean 64DA, `errors`: File có lỗi, `many`: Nhiều dự án giả lập - 39 dự án), kèm `TestBanner` khi đang bật chế độ test (có nút Sinh lại, Thoát).
    - Nút chuyển giao diện Sáng / Tối (`themeBtn`, lưu `pmo-theme` trên `localStorage`, gắn `data-theme="light|dark"` lên `<html>`).
    - Nút `?` mở **Trung tâm Hướng dẫn (`HelpDrawer`)**.
    - Nút `Xuất báo cáo` (hiện khi `loaded === true`, mở modal Xuất).
- **Thanh Rail bên trái (`tabs`)**:
  - Chỉ hiển thị đúng **3 nút**: `Bảng` (`grid`), `Phiên bản` (`ver`), `Nhật ký` (`log`).
  - **Không** hiển thị `Điều hành`, `Rủi ro`, `Hệ thống`, `Mẫu BC`, `Cảnh báo`, `AI` dọc, `Ghi chú`.
- **Thanh StatusBar dưới đáy (chỉ hiện ở màn `grid` khi đã nạp file)**:
  - Hiển thị số dòng & 49 cột (`X dòng · 49 cột`), `selInfo()` (tóm tắt vùng đang chọn nếu chọn nhiều ô).
  - Bên phải: Bộ điều khiển `Zoom` (`− 100% +`, dải `50%–200%`, lưu `pmo-proto-grid-v1`) và nút `Chú thích` (`legendBtn` mở popover chú thích ô lỗi/sửa tay/AI nháp/pill trạng thái/nguồn cột/màu nhóm).
  - Đã bỏ đếm ô trống bắt buộc, ô AI chờ duyệt, `"không còn lỗi chặn"`, dòng `"Đã chốt v..."` và `.ftcell` ở footer.

### 4.2. Bước 1 · Màn Nhập file & Xem trước (`ImportView` + `FilePreview`)
- **Trạng thái chưa nạp (hoặc đang "Thay file")**:
  - Bố cục 2 cột (`.acols`):
    - Cột trái: Tiêu đề `Nhập file Jira` (hoặc `Thay file Jira`), vùng kéo thả `#dropzone` (chọn file `.csv/.tsv/.txt/.xlsx/.xlsm/.xls` hoặc nút `Dùng dữ liệu mẫu` / `Nạp lại dữ liệu mẫu`), **không** hiện hướng dẫn cách export Jira (`impHowto = ''`). Khi đã chọn file staged -> hiện thẻ `.pvstaged` (tên file, dung lượng, nút `Đọc file này`, `Chọn file khác`).
    - Ngay dưới vùng kéo thả (trước khi nạp): Khung `pvCard('pre')` cao hết vùng nhìn (`calc(100vh - 110px)`) xem trước nội dung file đang chọn/gần nhất, có nút mở **Xem trước toàn màn hình (`#pvfs`)**.
    - Cột phải: `Lần nhập gần nhất` (`impRecent`: tối đa 3 file gần nhất kèm nút xem lại lịch sử file cũ `histToggle` và danh sách `Bản đã lưu trên hệ thống` `impSaved()`).
- **Trạng thái Đang đọc file (`state.importing`)**:
  - Thanh tiến độ dọc + cột phải "Đã tìm thấy" với hiệu ứng skeleton chuyển sang con số thực. Có nút `Huỷ, chọn file khác`.
- **Trạng thái Đã nạp file (`impPostA`)**:
  - Header tên file + nút `Thay file khác` + nút chính `Mở bảng báo cáo` (`stepGo(3)`).
  - Khối thống kê `impStats()`: thẻ số Issue (`112` trong 93 cột với Clean 64DA, mặc định `realOnly = true` nạp bộ `GOLD` 64 epic thật; có thể chuyển kịch bản test từ menu `Dữ liệu thử`), số Dự án + phân bố `Trạng thái` & `Tiến độ`, bảng 49 cột lọc theo `Tất cả / Đủ dữ liệu / Thiếu dữ liệu` (mapping cố định mặc định, bỏ thanh `mpBar` và dropdown đổi mapping cột, ẩn 7 cột chưa có nguồn Jira `NO_JIRA = ['phong','tp','bo','aieng','airs','mlops','swe']` trong tóm tắt).
- **Xem trước file toàn màn hình (`FilePreviewModal` `#pvfs`)**:
  - Thanh trên: Nút `‹ Quay lại`, tên file, tìm kiếm trong sheet `#pvq` (`↑ Trước`, `Sau ↓`, đếm kết quả), nút `Đóng (Esc)`.
  - Thanh công thức đọc chỉ đọc: `#pvaddr` (tọa độ ô như `B12`) và `#pvval` (nội dung đầy đủ của ô đang bấm).
  - Lưới ảo/scroll mượt cho sheet CSV/Excel lớn, chuyển sheet nếu file có nhiều sheet.

### 4.3. Bước 2 · Bảng tính 49 cột (`GridView`) — Bỏ hoàn toàn `CheckView`
- **Không xây dựng `CheckView` (`view === 'check'`)**: Đúng theo luồng 3 bước gọn, mọi kiểm tra và sửa lỗi thực hiện trực tiếp tại tóm tắt bước Nhập file và ngay trên Bảng 49 cột (kể cả kịch bản test `errors` sẽ điền sẵn các ca lỗi/ô trống/nháp AI để thao tác trên Import và Grid).
- **Không có thanh `AgBar` tím & thanh `SelBar` AI chờ duyệt**:
  - Chỉ hiển thị `editBanner` trên đầu lưới nếu người dùng đang mở sửa tiếp một phiên bản cũ (`state.editWk && state.editWk !== 'w3'`).
  - `SelBar` chỉ hiện khi có dòng được tick checkbox (`rowSel`).
- **Thanh công cụ `FormatBar` (`.fbar`)**:
  - Ô địa chỉ `#refbox` (hỗ trợ gõ `AT12` hoặc mã dự án + Enter / `Ctrl+G`).
  - Định dạng ô: `B`, `I`, `U`, `S`, màu chữ, màu nền ô, `↵` Wrap text (chỉ áp cho ô đang chọn), **Căn lề (`alignBtn`)**: căn ngang (trái/giữa/phải) + căn dọc (trên/giữa/dưới).
  - Ô công thức `.fxval`: khi chọn ô đang làm -> hiện editor/dropdown nhanh; đối với ô hệ thống (`cfg`) chỉ hiển thị giá trị Jira (`col · Jira`) không có nút yêu cầu sửa hệ thống.
  - Công cụ bên phải:
    - `Tìm trong bảng` (`Ctrl+F`, mở `FindCard` hỗ trợ phân biệt hoa/thường, nguyên từ, lọc dòng khớp).
    - Chip xóa lọc / xóa sắp xếp (khi có filter/sort).
    - **`✦ AI` chip (`agChip`)**: hiện tổng số ô AI chờ duyệt, bấm để mở/đóng drawer **Trợ lý AI**.
    - **`⚠ Dòng cần sửa` (`fixChip.sm`)**: bấm để lọc chỉ hiện dòng còn lỗi/thiếu bắt buộc hoặc chờ duyệt AI.
    - `N cột ẩn` (khi có cột bị ẩn).
    - **Menu `▦ Cột · X/49`**: gồm nút `Cấu hình mẫu: số tuần, cột, phiên bản…` (mở panel `TplConfigPanel` cấu hình số tuần hiển thị/phiên bản nếu cần), chip `Xem nhanh` (Đủ 49 cột / Tuần này / Cột cần rà / Thông tin dự án / Chỉ cột từ Jira), dải **`Khối cột`** (`Thông tin`, `Tiến độ`, `Đơn vị & NS`, `Phân loại`, `T01/11`, `T02/11`, `T3/11`, `T4/11` với màu nhận diện giống file mẫu), danh sách 49 cột có checkbox ẩn/hiện, và checkbox ghim cột Công việc (`pinViec`).
    - *(Lưu ý: Đã ẩn nút `Rổ gom` trong chế độ lite)*.
- **Lưới 49 cột (`Grid` + `Cell`)**:
  - Cấu trúc nhóm cột 2 tầng header (tầng nhóm màu `--tK`, `--tO`, `--tY`, `--tW` + tầng tên cột kèm icon nguồn dữ liệu, lọc/sắp xếp cột `FilterPopup` & menu chuột phải `ContextMenu`).
  - Trên mỗi dòng nhóm (group header row): hiển thị số dự án chậm (`grpLate`) và nút **`N ô cần sửa →` (`fixGo`)** — bấm lần lượt cuộn mượt tới từng ô cần sửa, bật vòng sáng nhịp đập `.fxpulse` và tooltip nổi `#fxTip` (`Ô 1/3 · Mã DA · Tên cột · Lý do`).
  - Ghim cột checkbox (`ckc` sticky left), cột `Mã DA` (`key`, bấm mở **Chi tiết dự án** `.malink`), và cột `Công việc` (`pinViec`).
  - **Dropdown chọn 1 chạm (`#pkPop`)**: Bấm 1 lần vào bất kỳ ô có `optsFor(f)` (hoặc mũi tên `▾` `.cdd`, hoặc ô bắt buộc trống `.reqph.pick`) sẽ mở popup danh sách chọn chuẩn với tùy chọn `Theo Jira`, các giá trị dạng pill `.spill`/`.lvl` có dấu `✓`, và `Bỏ giá trị` — không dùng `<select>` mặc định của trình duyệt.
  - Ô bắt buộc trống hiển thị placeholder `.reqph` (chấm đỏ + `Chọn … ▾` hoặc `Nhập …`).
  - Ô nháp AI chưa duyệt hiển thị chữ tím; ô Agent đang đề xuất từ khung chat hiển thị `.cell.aipend` (viền tím đứt + shimmer + ghost diff `cũ → ✦ mới`).
  - Ô vừa sửa tay nháy xanh `.svflash`.
  - Hỗ trợ đầy đủ thao tác Excel: chọn vùng bằng kéo chuột (`selDrag`) hoặc `Shift+Click`, `FillHandle` kéo góc dưới phải ô điền xuống, kéo mép phải/dưới bất kỳ ô nào (`EDGE=5`) để đổi rộng cột / cao dòng (`GX.rowH`), nhấp đúp mép để autofit, phím tắt `Enter`, `Tab`, `Esc`, phím mũi tên, `Ctrl+B/I/U`, `Ctrl+Z` / `Ctrl+Y` (lưu stack 100 bước hoàn tác/làm lại cho các ô chỉnh tay, nháp AI, định dạng, wrap).

### 4.4. Panel bên phải: Trợ lý AI (`HubPanel` — tab AI) & AI Soạn nháp (`AiTracePanel`)
- Mọi panel bên phải dùng chung cơ chế **kéo đổi độ rộng (`.pnrz`, min `300px`, max `75vw`), nút phóng to/thu nhỏ (`pnBig`, lưu `pmo-proto-panel-v1`) và gập/mở từng mục `.pnsh`**.
- **Trợ lý AI (`hubAI`)**:
  - **Không** còn 3 tab chuyển `Cảnh báo / AI / Ghi chú` (`.seg3` ẩn trong `lite`), chỉ hiện tiêu đề `Trợ lý AI`.
  - **Màn chào mới (`ai9`)** khi chưa có hội thoại: Quả cầu xoay conic-gradient `✦`, lời chào cá nhân hóa (`Chào Khuê, cần gì cho Tuần 3/11?`), 3 thẻ số liệu bấm được (`dự án`, `chậm tiến độ`, `nháp chờ duyệt`), và **2 dải chip chạy ngang (marquee)** tự dừng khi hover: `Hỏi nhanh` và `Nhờ Agent làm`.
  - **Hội thoại & Agent hành động kiểu Rovo**:
    - Hỗ trợ hỏi đáp dữ liệu tuần, hỏi rủi ro/tiến độ từng dự án theo mã (`I.A.3.1`), và **lệnh tự nhiên sửa bảng** (`Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ`, `Điền Note "..." cho các dự án đang trống`, `Duyệt hết nháp của ...`, `Ẩn/Hiện cột ...`, `Chỉ hiện dòng cần sửa`).
    - Hiệu ứng đang gõ (`aityping` 3 chấm), tin nhắn mới trượt vào (`.nw`), giữ 1 hàng gợi ý gọn `.aisug` phía trên ô nhập `#askIn`.
    - Khi Agent sửa bảng: **không ghi đè thẳng**, mà tạo **Bảng xem trước (`stgHtml`)** ngay trong khung chat (tick chọn từng dòng, `Xem thêm`, nút `Áp dụng N thay đổi` / `Bỏ`).
    - Khi Agent soạn hoặc áp dụng thay đổi: chạy **con trỏ `✦ Agent` (`#agCur` + `agWalk`)** tự cuộn bảng tới từng ô, di chuyển con trỏ nổi qua tối đa 6 ô tiêu biểu và nháy tím `.aiflash` khi áp dụng.
- **Khung `AI soạn nháp` (`AiTracePanel` / `panelTrace`)**:
  - Mở khi bấm `"Xem AI soạn ra sao ›"` hoặc từ thanh duyệt từng ô (`Spotlight` -> `aiTraceRv`).
  - Hiển thị 3 phần đánh số: `1. AI đọc gì` (nhóm Progress Report tuần `15–22/11`, Comment `Risk:`, giá trị do code tính sẵn `K1–K3`), `2. Luật viết cho cột`, `3. Nháp AI trả về` (kèm tag trạng thái, chấm điểm mức độ rủi ro cho cột `AC`, các câu trích dẫn `.trs` + tag `.cite` — rê chuột vào câu sẽ highlight dòng đầu vào tương ứng `.trl.hl`), chọn 3 biến thể (`Ngắn hơn`, `Mặc định`, `Chi tiết hơn`), khung `<details>` *"Xem yêu cầu gửi V-LLM và kết quả trả về"*, và chân panel (`Bỏ nháp`, `Sửa`, `Nhờ AI soạn` / `Duyệt`, `Ô nháp kế ›`).

### 4.5. Modal Chi tiết dự án (`ProjectPopout` — Phương án A kiểu Linear / Twenty)
- Mở khi bấm vào bất kỳ `Mã DA` (`.malink`) trên bảng tính.
- **Header (`pa-top`)**:
  - Hàng 1: Điều hướng dự án trước/sau (`1 / N`), badge `Mã DA`, `Mảng việc`, ô tìm kiếm nội bộ `#poQ` (đếm kết quả, nút `↑ / ↓`), **nút chỉnh cỡ chữ `A / A` (`.pa-fz`, lưu `pmo-po-fz`)**, nút đóng `✕ (Esc)`.
  - Tiêu đề lớn dự án (`h2.pa-title`) + dải chips (`PIC` avatar, `Trạng thái` pill, `Tiến độ` pill, `Rủi ro` pill, `Thời gian` + số ngày còn lại / quá hạn).
- **Thân 2 cột có vách kéo (`.pa-split`, lưu `pmo-po-sidew`, mặc định `300px`, nhấp đúp để reset)**:
  - **Cột trái (`.pa-side`)**: Các nhóm thuộc tính gập/mở được (`Thông tin`, `Tiến độ`, `Đơn vị & nhân sự`, `Phân loại`), tự động loại bỏ các trường chữ dài (`muctieu`, `kpi`, `milestone`).
  - **Cột phải (`.pa-main`)**:
    - Khối `Tổng quan` (`.pa-ov`): `Mục tiêu` và `KPI` rút gọn 3 dòng kèm nút `Xem thêm / Thu gọn`; **`Milestone` hiển thị dạng dòng thời gian dọc (`.pa-ms`)** tự đánh dấu mốc đã qua / kế tiếp.
    - Khối `Báo cáo tuần`: nút đảo thứ tự `Mới nhất trước ⇅`, các thẻ tuần (tuần hiện tại `w3` mở mặc định và ẩn các mục trống; các tuần cũ thu gọn thành thanh tóm tắt 1 dòng bấm để mở rộng; tuần nào có từ khóa tìm kiếm tự động mở ra và highlight `<mark>`).

### 4.6. Màn Phiên bản (`VersionsView`)
- **Khối So sánh ở trên (`vbBlock`)**:
  - 2 dropdown chọn `Bản này` so với `Bản trước`.
  - 4 thẻ số KPI delta (`Đúng tiến độ`, `Nguy cơ chậm`, `Chậm tiến độ`, `Rủi ro cao`) với mũi tên `↑/↓` tô xanh/đỏ theo chiều tốt lên hay xấu đi.
  - **Biểu đồ cột ghép SVG (`.vbsvg`)** so sánh trực quan 2 bản kèm chú giải màu.
  - Danh sách các dự án thay đổi tình trạng/rủi ro (xem trước 5 dòng + nút `Xem thêm`).
- **Danh sách các bản đã chốt (`.vlt` / `vlTable3`)**:
  - Nhóm theo tuần (`w3`, `w2`, `w1`), bản mới nhất trên cùng có nhãn `mới nhất`, tên file đã xuất, người chốt, trạng thái (`Đã xuất` / `Đã chốt`), ghi chú.
  - Bấm vào bất kỳ dòng nào để **mở rộng nhanh bảng 5 chỉ số (`vloks`)**: `Đang chạy`, `Đúng tiến độ`, `Nguy cơ chậm`, `Chậm tiến độ`, `Rủi ro cao` + nút **`Mở trên bảng tính →` (`vlEdit`)** để nạp bản đó lên lưới và hiện banner `"Đang sửa tiếp Bản X · Tuần ... — Về tuần này"`.

### 4.7. Màn Nhật ký (`LogView` — kiểu Toggl Audit Log)
- Thanh lọc: Select loại hoạt động (`Mọi hoạt động`, `Chỉnh sửa ô`, `Dữ liệu & nhập file`, `AI`, `Chốt & xuất`, `Có cảnh báo`), Select người làm (`Mọi người` tự lấy từ dữ liệu log), nút `Bỏ lọc`, và ô tìm kiếm `#akQ` (không mất focus/con trỏ tiếng Việt khi gõ).
- Bảng gom theo ngày (`Hôm nay`, `Ngày`), 3 cột:
  - `Người`: Avatar tròn (chữ cái đầu tên người, hoặc `✦` cho Trợ lý AI, `⟳` cho Tự động).
  - `Hoạt động`: Dấu hiệu `+` / `−` / `↻`, tên hành động, đối tượng badge `.ako`, tag cảnh báo/lỗi `.lxw`, và phần chi tiết tự tách mũi tên thành pill **`từ → thành`** (`.lgfrom` → `.lgto`).
  - `Lúc`: Giờ monospace.

### 4.8. Trung tâm Hướng dẫn (`HelpDrawer`) & Tour tương tác (`Spotlight`)
- Bấm nút `?` ở Header mở ngăn kéo bên phải `420px` (`.hpdr`):
  - Ô tìm kiếm `#hpQ` lọc đồng thời cả Chủ đề theo màn hình và FAQ.
  - Thẻ *"Mỗi tuần làm 3 bước"* (`1. Nhập file`, `2. Điền & duyệt`, `3. Chốt & xuất`) + nút `Xem tour 1 phút` (`TOURS.all` chỉ đi qua 3 bước thực tế: Nhập file → Bảng 49 cột → Trợ lý AI → Chốt & xuất → Phiên bản, **không** nhảy vào `CheckView`).
  - Danh sách 6 chủ đề màn hình (`Nhập file Jira`, `Điền & duyệt trên bảng`, `Trợ lý AI`, `Chốt & xuất báo cáo`, `Phiên bản`, `Nhật ký`): nội dung hướng dẫn được làm sạch khớp đúng bản gọn (bỏ các câu nhắc cũ về mapping thủ công / hệ thống / rổ gom). Bấm nút `Chỉ cho tôi trên màn hình →` chạy spotlight tour tương ứng.
  - Mục `Hỏi nhanh` (FAQ cập nhật đúng bản gọn) và `Phím tắt` (7 phím tắt).
- Tự động chạy tour Phiên bản lần đầu người dùng mở tab Phiên bản (lưu `pmo-tour-ver`).

### 4.9. Bước 3 · Modal Chốt & Xuất báo cáo (`ExportModal`)
- **Không còn lỗi chặn xuất** (`blockers()` trả về rỗng; các ô thiếu/cảnh báo chỉ hiện dạng nhắc nhở vẫn chốt được bình thường).
- Gồm 3 bước nội bộ: `1. Kiểm tra` → `2. Chốt bản vN` → `3. Xuất file`.
- **Chỉ giữ lại tùy chọn xuất Excel 49 cột (`Báo cáo tuần chi tiết .xlsx`)** — đã ẩn hoàn toàn phần Báo cáo điều hành Word/PDF.
- Hỗ trợ chọn cấu hình số tuần xuất (`exColsBlock`), nhập tên file đích (mặc định `20261121_DAN_Bao-cao-PMO.xlsx`), và sinh file `.xlsx` thật bằng hàm OOXML thuần JS tích hợp (lưu lịch sử vào `state.versions` và `localStorage`).

---

## 5. Cấu trúc thư mục mới tại `client/src/`

```
client/src/
├── vite-env.d.ts           # GIỮ NGUYÊN từ khung gốc
├── main.tsx                # Nạp CSS, áp theme lưu trữ, mount App
├── App.tsx                 # AppShell: TopBar, TestBanner, Rail (3 mục), MainView, Panels, Overlays
├── styles/
│   └── pmo-prototype.css   # Toàn bộ CSS chuẩn trích xuất từ prototype mới (bao gồm html.lite & vòng 1-10)
├── types/
│   └── index.ts            # Row, Field, AgStage, PopoutState, TraceTarget, VersionItem, LogEntry, AppState
├── data/
│   ├── demo.json           # DEMO (38 dự án giả lập + 277 cột) & GOLD (Clean 64DA + 2 real issues + ORPHANS + GOLD_CSV)
│   ├── constants.ts        # WEEKS, FIELDS (49 cột), GRP, GROUPS, STATUS_MAP, PROG_MAP, PHASE_BUCKET, SEED_VERSIONS, HELP, FAQ, KEYS, TOURS
│   └── logo.ts             # LOGO_SRC (hoặc dùng /logo.png)
├── lib/
│   ├── cell.ts             # colLetter, colNum, refOf, cellValue, displayText, sourceValue, locked, optsFor, spillCls
│   ├── clean.ts            # Chuẩn hóa văn bản Jira (cleanText, cleanKpi, cleanComment, CLEAN_RULES, cleanStats)
│   ├── grid.ts             # visibleFields, findMatches, passColFilters, selKeys, autofit width helpers
│   ├── ai.ts               # aiDrafts, trInputs, trDraft, trText, askAnswer (NLP + Staged Preview)
│   ├── versions.ts         # snapshot, diffSnap, vSnap, vCompare2, cxNote, vhList, verEditList
│   ├── popout.ts           # poWeeks, poHitsCompute, milestone timeline parser
│   ├── xlsx.ts             # Đọc CSV/XLSX preview & xuất file .xlsx OOXML (49 cột chuẩn styled)
│   └── theme.ts            # Dark/light mode persistence
├── store/
│   ├── index.ts            # Zustand + Immer root store, undo/redo history (100 steps), nav history (50 steps), localStorage sync
│   └── actions/
│       ├── flow.ts         # goStep, curStep, loadFile, loadFileNow, enterTest, exitTest, setView, setPanel, setModal, navGo
│       ├── grid.ts         # selectCell, applyEdit, revertCell, setFmt, toggleWrap, setZoom, setRowHeight, toggleCol, grpTog, fixGo, pkPick
│       ├── ai.ts           # askSend, stgToggle, stgApply, stgDrop, agWalk trigger, trOpen, trVar, trOk, trEdit, trDrop
│       ├── popout.ts       # poOpen, poClose, poSearch, poNav, poToggleGroup, poToggleWeek, poFontSize, poSideWidth
│       ├── versions.ts     # doLock, doExport, vlEdit, vlExitEdit, vlTogExpand, vbSelect
│       └── help.ts         # helpOpen, helpClose, helpSearch, tourGo
├── hooks/
│   ├── useKeyboard.ts      # Excel keys (Arrows, Enter, Tab, Esc, Ctrl+Z/Y, Ctrl+F, Ctrl+G, Ctrl+B/I/U), Alt+Left/Right nav, Popout Esc
│   └── useGridResize.ts    # Kéo mép ô (EDGE=5) đổi rộng cột / cao dòng, kéo vùng chọn (selDrag)
├── components/
│   ├── common/
│   │   ├── Icons.tsx       # SVG nét mảnh chuẩn prototype (logo, file icons, group icons, agent sparkles)
│   │   └── RiskText.tsx    # Highlight text rủi ro & tìm kiếm
│   ├── layout/
│   │   ├── TopBar.tsx      # Header + NavBtns + WeekPicker + 3 Steps + TestMenu + ThemeBtn + HelpBtn + ExportBtn
│   │   ├── Rail.tsx        # 3 mục: Bảng, Phiên bản, Nhật ký
│   │   ├── TestBanner.tsx  # Banner chế độ dữ liệu thử
│   │   ├── EditBanner.tsx  # Banner "Đang sửa tiếp Bản vX · Tuần Y"
│   │   ├── StatusBar.tsx   # Footer đơn giản + Zoom + Chú thích (LegendPop)
│   │   └── Toast.tsx       # Toast thông báo & thanh chạy AI
│   ├── grid/
│   │   ├── FormatBar.tsx   # Address box, Format B/I/U/S/Color/Fill/Wrap/Align, Formula val, Find/Filter/AI chip/FixChip/ColsMenu
│   │   ├── SelBar.tsx      # Chỉ hiện khi tick chọn nhiều dòng
│   │   ├── Grid.tsx        # Bảng tính 49 cột, sticky header & columns, group rows với nút fixGo
│   │   ├── Cell.tsx        # Cell renderer với pill trạng thái, placeholder .reqph, .cdd ▾, .malink, .aipend ghost, .svflash, .fxpulse
│   │   ├── CellEditor.tsx  # Editor text trực tiếp tại ô & trên thanh fx
│   │   ├── PickerPop.tsx   # Dropdown 1 chạm #pkPop thay thế select mặc định
│   │   ├── FillHandle.tsx  # Điểm neo kéo sao chép dữ liệu
│   │   └── AgentCursor.tsx # Con trỏ nổi ✦ Agent (#agCur) & tooltip lỗi (#fxTip)
│   ├── panels/
│   │   ├── AiAssistantPanel.tsx  # Trợ lý AI màn chào ai9 + Chat + Bảng xem trước Rovo stg + Gợi ý gọn
│   │   ├── AiTracePanel.tsx      # Khung giải trình AI 3 bước + citable hover + 3 biến thể + V-LLM JSON
│   │   └── TplConfigPanel.tsx    # Cấu hình số tuần hiển thị (mở từ Menu Cột)
│   ├── modals/
│   │   ├── ProjectPopout.tsx     # Modal chi tiết 2 cột kiểu Linear (.pa-box) với splitter & milestone timeline
│   │   ├── ExportModal.tsx       # Modal 3 bước nội bộ, chỉ xuất Excel 49 cột
│   │   ├── AiDoneModal.tsx       # Kết quả hoàn tất sinh nháp AI
│   │   └── HelpDrawer.tsx        # Ngăn kéo hướng dẫn sử dụng, tìm kiếm, FAQ, shortcuts
│   └── layers/
│       ├── ContextMenu.tsx       # Chuột phải trên ô/cột
│       ├── FilterPopup.tsx       # Lọc giá trị theo cột
│       ├── FindCard.tsx          # Hộp tìm & lọc (Ctrl+F)
│       ├── PECard.tsx            # Sửa ô nhiều dòng / ô AI dài
│       └── Spotlight.tsx         # Tour hướng dẫn từng bước trên UI & Duyệt từng ô AI
└── views/
    ├── Import/
    │   ├── ImportView.tsx        # Bước 1: Trước nạp (2 cột + preview), Đang đọc (tiến trình), Đã nạp (thống kê Jira -> 49 cột)
    │   └── FilePreviewModal.tsx  # Xem trước toàn màn hình #pvfs với formula bar #pvaddr & #pvval
    ├── Versions/
    │   └── VersionsView.tsx      # So sánh 2 bản (4 KPI + SVG bar chart) + Danh sách phiên bản xổ chỉ số nhanh
    └── Log/
        └── LogView.tsx           # Nhật ký kiểu Audit Log với lọc loại, người làm, tìm kiếm & badge từ → thành
```

---

## 6. Những quyết định kỹ thuật mặc định (Architectural Calls)

1. **Quản lý CSS 100% nguyên bản**: Trích xuất toàn bộ CSS trong thẻ `<style>` của file prototype vào `client/src/styles/pmo-prototype.css` và giữ `lite` behavior ngay trong cấu trúc component/CSS để giao diện (spacing, dark/light tokens, animations, responsive breakpoints) khớp 100% pixel-perfect.
2. **Đổi hoàn toàn tên biến nội bộ sạch hay giữ `field.id` khớp prototype**: Giữ nguyên `field.id` chuẩn tiếng Việt không dấu như prototype (`ma`, `viec`, `mang`, `tt`, `td`, `buocso`, `ht`, `kh`, `vd`, `rui`...) bên trong lớp React mới thay vì map đổi qua tiếng Anh ở FE — điều này loại bỏ hoàn toàn tầng map lỗi từng gây bug ở bản FE cũ và giữ tương thích 100% với cấu trúc `GOLD`, `DEMO`, `SEED_VERSIONS`, `TR_RULES`, `localStorage` của prototype.
3. **Thay thế monkey-patch DOM của JS prototype bằng React state/render thuần**: Các vòng góp ý 1–10 ở cuối file prototype hoạt động bằng cách bọc hàm (`_render`, `_handleRid`) và can thiệp DOM thủ công (`pnDecorate`, `gridDecorate`). Trong React, mọi hành vi đó sẽ được hợp nhất thẳng vào JSX/state/hooks sạch sẽ ngay từ đầu (ví dụ: không cần patch regex lên chuỗi HTML).
4. **Phạm vi kiểm thử Vitest theo cấu hình gốc (`environment: 'node'`):** Giữ nguyên `client/package.json` và `client/vite.config.ts` (`test: { environment: 'node' }`, không cài thêm `jsdom` hay `@testing-library/react`). Bộ test sẽ kiểm thử unit toàn bộ logic `lib/*` (tính ô, làm sạch text, sinh nháp/lệnh Agent, so sánh phiên bản, xuất OOXML `.xlsx`), các store actions (`flow`, `grid`, `ai`, `popout`, `versions`, `help`), và SSR smoke test (`renderToString`) cho mọi View/Panel/Modal chính. Các hiệu ứng DOM trình duyệt thuần (vị trí `#pkPop`, `agWalk`, kéo mép ô/splitter) sẽ được kiểm tra thực tế khi chạy `npm --prefix client run dev`.
5. **Đọc file `.csv` / `.xlsx` / `.xls` không thêm npm dependency:** Giữ nguyên parser CSV & XLSX thuần JS (`pvReadCsv`, `pvReadXlsx` giải nén ZIP/Deflate bằng `DecompressionStream`) từ prototype; với file `.xls` nhị phân cũ hoặc file lỗi định dạng, giữ cơ chế nạp động SheetJS từ CDN (`cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`) kèm thông báo lỗi thân thiện nếu chạy offline/bị chặn mạng.
6. **Quy trình kiểm tra cuối cùng:** Chỉ sử dụng `npm --prefix client run typecheck`, `npm --prefix client test`, và `npm --prefix client run dev`. Tuyệt đối không dùng `npm run build`.

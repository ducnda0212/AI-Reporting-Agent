import type { AppState } from '@/store/types';

/** Các bước hướng dẫn sử dụng. `sel`: phần tử được làm sáng; `prep`: chuẩn bị state trước khi hiện bước; `load`: cần nạp dữ liệu mẫu trước. */
export interface TourStep { sel?: string; t: string; b: string; load?: boolean; prep?: (d: AppState) => void }

const goGrid = (d: AppState) => {
  d.view = 'grid'; d.onlyFix = false; d.search = ''; d.collapsed = {}; d.panel = null; delete d.hidden.status;
};
const check = (d: AppState) => { d.view = 'check'; };

export const TOUR: TourStep[] = [
  { t: 'Chào mừng tới PMO Reporting', b: 'Công cụ biến file Jira export thành báo cáo tuần 49 cột theo đúng mẫu của khối. Hướng dẫn này đi qua từng phần trong khoảng 1 phút. Dùng phím → và ← để chuyển bước, Esc để thoát.' },
  { sel: 'nav[aria-label="Các bước"]', t: 'Bốn bước mỗi tuần', b: 'Nhập file → Kiểm tra dữ liệu → Điền & duyệt → Chốt & xuất. Con số là số việc còn lại. Bấm vào bước nào thì tới bước đó, hoặc dùng nút ‹ › để lùi hay tiến từng bước — lùi lại không làm mất gì.' },
  { sel: '#dropzone', prep: (d) => { d.view = 'import'; d.panel = null; }, t: 'Bước 1 · Nhập file', b: 'Kéo file CSV export từ Jira vào đây, hoặc bấm “Dùng dữ liệu mẫu”. Công cụ đọc 277 cột của file, gộp cột trùng tên và so với lần nhập trước.' },
  { sel: '.ckwrap', load: true, prep: check, t: 'Bước 2 · Cột của mẫu ↔ trường Jira', b: 'Nếu một trường trên Jira bị đổi tên, cột tương ứng mất nguồn. Chọn trường mới trong danh sách hoặc bấm “Dùng gợi ý”. Lựa chọn được nhớ cho các tuần sau.' },
  { sel: '.ckwrap', prep: check, t: 'Giá trị chưa có luật quy đổi', b: 'Mẫu chỉ nhận một số giá trị cố định (ví dụ Đúng tiến độ / Chậm tiến độ). Giá trị lạ trên Jira như “Monitoring”, “TBD” cần bạn chọn giá trị tương ứng — hoặc kéo thả trong rổ gom.' },
  { sel: '.ckwrap', prep: check, t: 'Ghép issue vào dòng của mẫu', b: 'Mỗi issue được ghép vào dòng mẫu nhờ mã ở đầu Summary (vd I.A.5.1). Ở đây xử lý issue thiếu mã, mã mới, mã trùng và Labels lệch nhóm.' },
  { sel: '.ckwrap', prep: check, t: 'Nội dung cần người điền', b: 'AI đọc Progress Report để soạn Mức độ rủi ro, Kế hoạch tuần sau, Vấn đề & đề xuất. Mọi nháp phải được duyệt từng ô trước khi vào báo cáo.' },
  { sel: 'thead', prep: goGrid, t: 'Bước 3 · Bảng 49 cột', b: 'Bảng có đúng 49 cột của mẫu, màu đầu cột giống file Excel. Hàng trên cùng là nhóm cột và 4 khối tuần; khối tuần này có viền hồng.' },
  { sel: 'th:has([data-flt="status"])', prep: goGrid, t: 'Đầu cột', b: 'Bấm tên cột để xem cột lấy từ trường Jira nào và luật quy đổi giá trị. Biểu tượng con mắt bên phải để ẩn cột cho dễ nhìn.' },
  { sel: '.cell[data-f="status"]', prep: goGrid, t: 'Sửa ngay tại ô', b: 'Nhấp đúp (hoặc chọn rồi nhấn Enter) để sửa. Cột có danh sách thì hiện ô chọn. Enter để lưu, Esc để huỷ, Tab sang ô bên phải. Ô lấy từ Jira mà bị sửa tay sẽ có tam giác cam ở góc.' },
  { sel: '.fbar', prep: goGrid, t: 'Thanh sửa & định dạng', b: 'Hiện ô đang chọn, nguồn của ô và chỗ sửa giá trị. Bên trái là đậm, nghiêng, gạch chân, màu chữ, màu nền — như Excel. Giữ Shift khi bấm để chọn cả vùng.' },
  { sel: '.fbar .mwrap:last-child', prep: goGrid, t: 'Ẩn / hiện cột', b: 'Bảng dài 49 cột. Chọn “Tuần này” để chỉ xem 14 cột thay đổi mỗi tuần, hoặc tự bật tắt từng cột. Cột ẩn vẫn được xuất đủ.' },
  { sel: 'footer.status', prep: goGrid, t: 'Thanh trạng thái', b: 'Đếm lỗi chặn, ô bắt buộc còn trống, ô AI chờ duyệt. Nút “Duyệt từng ô” mở chế độ tập trung: làm mờ xung quanh, đưa bạn qua từng nháp AI kèm căn cứ. Muốn duyệt cả dự án: tick ô ở cột ngoài cùng bên trái (ô trên cùng là chọn tất cả).' },
  { sel: '.cfgchip', prep: goGrid, t: 'Cấu hình cột', b: 'Tra cứu khi cần: 49 cột của mẫu lấy từ đâu, bắt buộc không, tuần này đã đủ chưa. Việc hằng tuần không cần mở phần này.' },
  { sel: '.top .tact .btn', prep: goGrid, t: 'Bước 4 · Chốt & xuất', b: 'Hết lỗi chặn thì chốt thành một phiên bản (gõ tên người chốt), rồi xuất file Excel từ đúng bản đó. Công cụ chỉ ghi vào khối tuần này, giữ nguyên các khối tuần khác.' },
  { sel: '.rail .ri:nth-child(4)', prep: goGrid, t: 'Phiên bản & tuần đã qua', b: 'Tab Phiên bản liệt kê mọi bản đã chốt theo tuần, ai chốt, lúc nào, đổi những ô nào so với bản trước. Ô chọn tuần ở trên cùng mở bản đã chốt của tuần trước — chỉ xem, không sửa.' },
  { t: 'Xong rồi!', b: 'Bạn có thể mở lại hướng dẫn bất cứ lúc nào bằng nút “? Hướng dẫn” trên thanh trên cùng.' },
];

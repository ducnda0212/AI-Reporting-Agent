import type { AiFieldId, Field, FieldGroup, FieldId, TourKey, TourStep, WeekKey } from '@/types';


export const STAGES: readonly string[] = ['Xác định bài toán AI & Ý tưởng sản phẩm','Xác định yêu cầu nghiệp vụ chi tiết (PRD)','Khảo sát & chuẩn bị dữ liệu',
  'Thiết kế giải pháp','Huấn luyện mô hình','Đánh giá mô hình','Phát triển phần mềm','Tích hợp Software & Event Logging',
  'Kiểm thử & UAT','Đánh giá An ninh Bảo mật (ANBM)','Phê duyệt & Triển khai Go-Live','Đánh giá sau Go-Live (Post-Launch Report)'];

export const GRP: Record<FieldGroup, string> = {
  pin: 'Dự án', info: 'Thông tin dự án', prog: 'Tiến độ & trạng thái', org: 'Đơn vị & nhân sự', eval: 'Phân loại & đánh giá',
  w1: 'Tuần 01/11 · 31/10–06/11', w2: 'Tuần 02/11 · 07–14/11',
  w3: 'Tuần 3/11 · 15–22/11', w4: 'Tuần 4/11 · 23–30/11'
};

export const MAN3: readonly string[] = ['Thấp','Trung bình','Cao'];

/* câu hỏi mẫu của Trợ lý AI (prototype ASKQ L4168) */
export const ASKQ: readonly string[] = ['Dự án nào có nguy cơ trễ?', 'Dự án nào đến hạn trong 14 ngày tới?', 'Tóm tắt tuần này', 'Dự án nào còn nhiều ô trống?'];

export const MARKETS: readonly string[] = ['VN','Indo','Malay','Thái','Phil','Sing','Toàn khu vực'];

export const DOMAINS: readonly string[] = ['Food','Ride','Express','Driver','Fleet','Payment','Platform'];

export const FIELDS: Field[] = [
  { col:'B',  id:'ma',       name:'Mã DA',                 grp:'pin',  kind:'jira',   src:'tách mã đầu Summary', w:92, key:true, required:true },
  { col:'C',  id:'viec',     name:'Công việc',             grp:'pin',  kind:'cfg',   src:'Summary', w:230, required:true },
  { col:'A',  id:'mang',     name:'Mảng việc',             grp:'info', kind:'cfg',    src:'Labels', w:210, required:true },
  { col:'D',  id:'muctieu',  name:'Mục tiêu',              grp:'info', kind:'cfg',   src:'Description', w:200 },
  { col:'E',  id:'kpi',      name:'KPI',                   grp:'info', kind:'cfg',   src:'Custom field (KPI/Outcome)', w:150 },
  { col:'F',  id:'pic',      name:'PIC',                   grp:'info', kind:'cfg',   src:'Custom field (Tech lead)', w:130, required:true },
  { col:'G',  id:'start',    name:'Ngày bắt đầu',          grp:'info', kind:'cfg',   src:'Custom field (Start date)', w:118 },
  { col:'H',  id:'end',      name:'Ngày kết thúc',         grp:'info', kind:'cfg',   src:'Due date', w:118 },
  { col:'I',  id:'tt',       name:'Trạng thái',            grp:'prog', kind:'bucket', src:'Status', w:130, required:true },
  { col:'J',  id:'td',       name:'Tiến độ',               grp:'prog', kind:'bucket', src:'Custom field (Progress)', w:120, required:true },
  { col:'K',  id:'milestone',name:'Milestone',             grp:'prog', kind:'jira',   src:'Description › Milestone', w:140 },
  { col:'L',  id:'buocso',   name:'Bước trong AI Lifecycle', grp:'prog', kind:'bucket', src:'Custom field (Phase)', w:130, required:true },
  { col:'M',  id:'output',   name:'Output',                grp:'prog', kind:'jira',   src:'Tài liệu AI Lifecycle (chưa có)', w:160 },
  { col:'N',  id:'note',     name:'Note',                  grp:'prog', kind:'manual', src:'nhập tay · tự thêm lý do chỉnh tay', w:180 },
  { col:'O',  id:'gdk',      name:'GĐK QLTT',              grp:'org',  kind:'cfg',   src:'Custom field (Team Name)', w:120 },
  { col:'P',  id:'phong',    name:'Phòng chịu trách nhiệm',grp:'org',  kind:'cfg',   src:'Hệ thống (theo Mảng việc)', w:150 },
  { col:'Q',  id:'tp',       name:'TP',                    grp:'org',  kind:'cfg', src:'Hệ thống (theo Mảng việc)', w:120 },
  { col:'R',  id:'bo',       name:'Business Owner',        grp:'org',  kind:'cfg', src:'Hệ thống', w:120 },
  { col:'S',  id:'po',       name:'Product Owner',         grp:'org',  kind:'cfg',   src:'Custom field (PO)', w:150 },
  { col:'T',  id:'aieng',    name:'AI Engineer (ML/Opt/Algo/LLM/DS)', grp:'org', kind:'cfg', src:'Hệ thống', w:150 },
  { col:'U',  id:'airs',     name:'AI researcher',         grp:'org',  kind:'cfg', src:'Hệ thống', w:120 },
  { col:'V',  id:'mlops',    name:'Data/MLOps Engineer',   grp:'org',  kind:'cfg', src:'Hệ thống', w:140 },
  { col:'W',  id:'swe',      name:'BE/FE/DevOps (Software Engineer)', grp:'org', kind:'cfg', src:'Hệ thống', w:160 },
  { col:'X',  id:'x',        name:'(cột trống trong mẫu)', grp:'org',  kind:'none',   src:'mẫu không đặt tên', w:100 },
  { col:'Y',  id:'caitien',  name:'Cải tiến/Xây mới',      grp:'eval', kind:'manual', src:'nhập tay', w:120, opts:['Cải tiến','Xây mới'] },
  { col:'Z',  id:'prio',     name:'Priority (Final)',      grp:'eval', kind:'manual', src:'nhập tay', w:100, opts:['P1','P2','P3'] },
  { col:'AA', id:'tt1',      name:'TRẠNG THÁI 1',          grp:'eval', kind:'calc',   src:'quá Due date chưa xong = chậm', w:200 },
  { col:'AB', id:'giatri',   name:'Giá trị mang lại của dự án', grp:'eval', kind:'manual', src:'chọn từ danh sách · mặc định Trung bình', w:130, required:true, opts:MAN3 },
  { col:'AC', id:'rui',      name:'Mức độ rủi ro',         grp:'eval', kind:'ai',     src:'AI đánh giá · sửa tay được', w:130, required:true },
  { col:'AD', id:'action',   name:'Action',                grp:'eval', kind:'manual', src:'nhập tay', w:100, opts:['Đi tiếp','Đã đóng','Tạm dừng'] },
  { col:'AE', id:'nextstep', name:'Đề xuất Next Step',     grp:'eval', kind:'manual', src:'nhập tay', w:190,
    opts:['Tiếp tục Duy trì (Maintain)','Mở rộng Quy mô (Scale)','Dừng / Đóng dự án'] },
  { col:'AF', id:'loai',     name:'Loại dự án',            grp:'eval', kind:'manual', src:'nhập tay', w:110, required:true },
  { col:'AG', id:'link',     name:'Link Confluence',       grp:'eval', kind:'manual', src:'nhập tay', w:170 },
  { col:'AH', id:'domain',   name:'Domain',                grp:'eval', kind:'manual', src:'chọn từ danh sách', w:100, opts:DOMAINS },
  { col:'AI', id:'market',   name:'Market',                grp:'eval', kind:'manual', src:'chọn từ danh sách', w:100, required:true, opts:MARKETS },
  { col:'AJ', id:'buoc',     name:'AI Lifecycle',          grp:'eval', kind:'bucket', src:'Custom field (Phase)', w:200, required:true },
  { col:'AK', id:'uoctinh',  name:'Ước tính chi tiết giá trị mang lại', grp:'eval', kind:'manual', src:'nhập tay', w:200 },
  { col:'AL', id:'w1ht',     name:'Công việc đã hoàn thành trong tuần', grp:'w1', kind:'report', src:'Progress Report · Tiến độ · Tuần 01/11', w:230 },
  { col:'AM', id:'w1kh',     name:'Kế hoạch tuần sau',     grp:'w1',   kind:'report', src:'Progress Report · Công việc sẽ làm', w:210 },
  { col:'AN', id:'w1vd',     name:'Vấn đề, rủi ro và Đề xuất giải pháp', grp:'w1', kind:'past', src:'bản đã chốt Tuần 01/11', w:200 },
  { col:'AO', id:'w2ht',     name:'Công việc đã hoàn thành trong tuần', grp:'w2', kind:'report', src:'Progress Report · Tiến độ · Tuần 02/11', w:230 },
  { col:'AP', id:'w2kh',     name:'Kế hoạch tuần sau',     grp:'w2',   kind:'report', src:'Progress Report · Công việc sẽ làm', w:210 },
  { col:'AQ', id:'w2vd',     name:'Vấn đề, rủi ro và Đề xuất giải pháp', grp:'w2', kind:'past', src:'bản đã chốt Tuần 02/11', w:200 },
  { col:'AR', id:'ht',       name:'Công việc đã hoàn thành trong tuần', grp:'w3', kind:'report', src:'Progress Report · Tiến độ · Tuần 3/11', w:240 },
  { col:'AS', id:'kh',       name:'Kế hoạch tuần sau',     grp:'w3',   kind:'ai',     src:'AI đọc Progress Report · Công việc sẽ làm', w:230 },
  { col:'AT', id:'vd',       name:'Vấn đề, rủi ro và Đề xuất giải pháp', grp:'w3', kind:'ai', src:'AI đọc Progress Report + Comment', w:240, required:true },
  { col:'AU', id:'w4ht',     name:'Công việc đã hoàn thành trong tuần', grp:'w4', kind:'future', src:'chưa tới tuần', w:180 },
  { col:'AV', id:'w4kh',     name:'Kế hoạch tuần sau',     grp:'w4',   kind:'future', src:'chưa tới tuần', w:160 },
  { col:'AW', id:'w4vd',     name:'Vấn đề, rủi ro và Đề xuất giải pháp', grp:'w4', kind:'future', src:'chưa tới tuần', w:180 }
];

export const AI_IDS = ['rui', 'kh', 'vd'] as const;

export const STATUS_VALUES: readonly string[] = ['Chưa thực hiện','Đang thực hiện','Đã hoàn thành','Tạm dừng','Hủy'];

export const STATUS_MAP: Record<string, string> = { 'TO DO':'Chưa thực hiện', 'OPEN':'Chưa thực hiện', 'BACKLOG':'Chưa thực hiện', 'IN PROGRESS':'Đang thực hiện', 'REOPENED':'Đang thực hiện', 'MONITORING':'Đang thực hiện',
  'DONE':'Đã hoàn thành', 'CLOSED':'Đã hoàn thành', 'RESOLVED':'Đã hoàn thành', 'PENDING':'Tạm dừng', 'HOLD':'Tạm dừng', 'ON HOLD':'Tạm dừng', 'PAUSED':'Tạm dừng', 'WAITING':'Tạm dừng',
  'CANCELED':'Hủy', 'CANCELLED':'Hủy', "WON'T DO":'Hủy' };

export const PROG_VALUES: readonly string[] = ['Đúng tiến độ','Chậm tiến độ','Tạm dừng','Có rủi ro'];

export const PROG_MAP: Record<string, string> = { 'On-track':'Đúng tiến độ', 'On Track':'Đúng tiến độ', 'Off-track':'Chậm tiến độ', 'Off Track':'Chậm tiến độ', 'Delayed':'Chậm tiến độ', 'Late':'Chậm tiến độ', 'Behind':'Chậm tiến độ', 'Behind Schedule':'Chậm tiến độ', 'At Risk':'Có rủi ro', 'Rủi ro':'Có rủi ro', 'On Hold':'Tạm dừng' };

/* Hướng dẫn tương tác (bản gọn: 3 bước Nhập file → Điền & duyệt → Chốt & xuất, không có bước Kiểm tra).
   `view` / `ver` thay cho hàm prep của prototype: màn cần mở sẵn trước khi chạy bước. */
const T_WELCOME: TourStep = { id: 'welcome', t: 'Chào mừng tới PMO Reporting', b: 'Công cụ biến file Jira export thành báo cáo tuần 49 cột theo đúng mẫu của khối. Hướng dẫn này đi qua từng phần trong khoảng 1 phút. Dùng phím → và ← để chuyển bước, Esc để thoát.' };
const T_STEPS: TourStep = { id: 'steps', sel: 'nav[aria-label="Các bước"]', t: 'Ba bước mỗi tuần', b: 'Nhập file → Điền & duyệt → Chốt & xuất. Bấm vào bước nào thì tới bước đó, hoặc dùng nút ‹ › để lùi hay tiến từng bước — lùi lại không làm mất gì.' };
const T_IMPORT: TourStep = { id: 'imp', sel: '#dropzone', view: 'import', t: 'Bước 1 · Nhập file', b: 'Kéo file CSV export từ Jira vào đây. Công cụ đọc 277 cột của file, gộp cột trùng tên và so với lần nhập trước.' };
const T_GRID: TourStep[] = [
  { id: 'grid-head', sel: 'thead', view: 'grid', t: 'Bước 2 · Bảng 49 cột', b: 'Bảng có đúng 49 cột của mẫu, màu đầu cột giống file Excel. Hàng trên cùng là nhóm cột và 4 khối tuần; khối tuần này có viền hồng.' },
  { id: 'grid-col', sel: 'th:has([data-f="tt"])', view: 'grid', t: 'Đầu cột', b: 'Rê chuột lên tên cột để xem cột lấy từ trường Jira nào. Nút phễu để lọc hoặc sắp xếp, biểu tượng con mắt bên phải để ẩn cột cho dễ nhìn.' },
  { id: 'grid-cell', sel: '.cell[data-f="tt"]', view: 'grid', t: 'Sửa ngay tại ô', b: 'Nhấp đúp (hoặc chọn rồi nhấn F2) để sửa. Cột có danh sách thì bấm một lần là hiện danh sách để chọn. Enter xuống ô dưới, Tab sang ô bên phải, Esc để huỷ. Ô lấy từ Jira mà bị sửa tay sẽ có tam giác cam ở góc.' },
  { id: 'grid-fbar', sel: '.fbar', view: 'grid', t: 'Thanh sửa & định dạng', b: 'Hiện ô đang chọn, nguồn của ô và chỗ sửa giá trị. Bên trái là đậm, nghiêng, gạch chân, màu chữ, màu nền — như Excel. Giữ Shift khi bấm để chọn cả vùng.' },
  { id: 'grid-cols', sel: '[data-act="menu"][data-m="cols"]', view: 'grid', t: 'Ẩn / hiện cột', b: 'Bảng dài 49 cột. Chọn “Tuần này” để chỉ xem 14 cột thay đổi mỗi tuần, hoặc tự bật tắt từng cột. Cột ẩn vẫn được xuất đủ.' }
];
const T_AI: TourStep = { id: 'ai-chip', sel: '.aichip', view: 'grid', t: 'Trợ lý AI', b: 'Nút ✦ AI trên thanh công cụ. AI đọc Progress Report trên Jira để soạn nháp Mức độ rủi ro, Kế hoạch tuần sau, Vấn đề & đề xuất. Con số là số ô nháp chờ bạn duyệt.' };
const T_EXPORT: TourStep = { id: 'export', sel: '[data-act="modal"][data-m="export"]', view: 'grid', t: 'Bước 3 · Chốt & xuất', b: 'Việc còn dở chỉ là cảnh báo, không chặn chốt. Chốt thành một phiên bản (gõ tên người chốt), rồi xuất file Excel từ đúng bản đó. Công cụ chỉ ghi vào khối tuần này, giữ nguyên các khối tuần khác.' };
const T_VER: TourStep = { id: 'ver', sel: '[data-act="view"][data-v="ver"]', view: 'grid', t: 'Phiên bản', b: 'Mỗi lần chốt sinh một bản. Mở tab Phiên bản để xem lại, so 2 bản với nhau, hoặc mở bản cũ để sửa tiếp.' };
const T_DONE: TourStep = { id: 'done', t: 'Xong rồi!', b: 'Mở lại hướng dẫn bất cứ lúc nào bằng nút ? ở góc trên bên phải.' };

export const TOURS: Record<TourKey, TourStep[]> = {
  all: [T_WELCOME, T_STEPS, T_IMPORT, ...T_GRID, T_AI, T_EXPORT, T_VER, T_DONE],
  imp: [T_IMPORT],
  grid: T_GRID,
  ai: [T_AI],
  exp: [T_EXPORT],
  ver: [
    { id: 'ver-list', sel: '.vb', view: 'ver', t: 'So sánh 2 bản', b: 'Chọn bản muốn xem và bản để so; thẻ số và biểu đồ cho thấy tình trạng dự án tốt lên hay xấu đi.' },
    { id: 'ver-saved', sel: '.vlt', view: 'ver', t: 'Các bản đã chốt', b: 'Bấm một bản để xem nhanh tổng quan; “Mở trên bảng” để mở lại bản đó trên bảng tính.' }
  ],
  log: [
    { id: 'log-filter', sel: '.lgbar', view: 'log', t: 'Lọc theo loại', b: 'Nhật ký ghi mọi việc bạn và AI đã làm. Lọc AI, Dữ liệu, Phiên bản, Chỉnh sửa, hoặc chỉ Cảnh báo.' },
    { id: 'log-search', sel: '.akq', view: 'log', t: 'Tìm nhanh', b: 'Gõ tên việc hoặc mã dự án, ví dụ I.A.5.1, để tìm ai đã làm gì với dự án đó.' },
    { id: 'log-list', sel: '.akbox', view: 'log', t: 'Từng hoạt động', b: 'Mỗi dòng: việc đã làm, đối tượng, chi tiết, kết quả và giờ. Màu biểu tượng cho biết loại việc.' }
  ]
};


/* tuần đang làm, dùng trong luật viết cho AI */
export const TR_WEEK = '15–22/11';
export const TR_RULES: Record<AiFieldId, string[]> = {
  kh: ['Chỉ lấy từ mục “Công việc sẽ làm” của tuần ' + TR_WEEK, 'Tối đa 2 ý, mỗi ý một câu ngắn, giữ thuật ngữ gốc', 'Không có dòng của tuần này → ghi rõ “Chưa có cập nhật tuần này”', 'Không thêm việc mà report không nhắc tới'],
  vd: ['Vấn đề lấy từ mục Blockers và dòng “Risk:” của Comment', 'Chậm hay không là do code tính (K1), AI không tự đánh giá', 'Đề xuất giải pháp đánh dấu là gợi ý, người duyệt quyết', 'Không có gì → “Không có vấn đề phát sinh trong tuần.”'],
  rui: ['Chọn 1 trong 3 mức: Thấp, Trung bình, Cao', 'Cao nếu K1 là Chậm tiến độ', 'Trung bình nếu có Blocker, Risk hoặc không cập nhật tuần này', 'Kèm lý do, mỗi lý do trỏ về một dòng đầu vào']
};

export const WK_TXT: Record<WeekKey, [string, string, string]> = { w1: ['w1ht', 'w1kh', 'w1vd'], w2: ['w2ht', 'w2kh', 'w2vd'], w3: ['ht', 'kh', 'vd'], w4: ['w4ht', 'w4kh', 'w4vd'] };

export const RUI_LV: Record<string, number> = { 'Thấp': 1, 'Trung bình': 2, 'Cao': 3 };

export const TT_RK: Record<string, number> = { 'Đúng tiến độ': 0, 'Có nguy cơ chậm': 1, 'Chậm tiến độ': 2 };

export const CX_PH: RegExp = /^(Không có\.?|Chưa có Progress Report.*|Chưa có cập nhật.*|—|-|N\/A)$/i;

export const LG_CAT: readonly [id: string, label: string, test: RegExp, icon: string][] = [
  ['ai', 'AI', /AI|Agent|V-LLM|nháp|duyệt/i, '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>'],
  ['ver', 'Phiên bản', /Chốt|phiên bản|Xuất|So sánh|Tải lại|Sửa tiếp/i, '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'],
  ['data', 'Dữ liệu', /Nhập|mapping|rổ|gom|cột|dòng|Gửi yêu cầu/i, '<path d="M4 6h16M4 12h16M4 18h10"/>'],
  ['edit', 'Chỉnh sửa', /.*/, '<path d="M4 20h4L19 9l-4-4L4 16z"/>']
];

export const HELP: { k: string; ic: string; t: string; d: string; s: string[] }[] = [
  { k:'imp', ic:'⤒', t:'Nhập file Jira', d:'Đưa file export vào và kiểm tra cột', s:['Bấm “Nhập file”, kéo file CSV/Excel export từ Jira vào.', 'Xem phần tóm tắt: cột nào lấy từ trường Jira nào (mapping).'] },
  { k:'grid', ic:'▦', t:'Điền & duyệt trên bảng', d:'Sửa ô, lọc, duyệt nháp AI', s:['Nhấp đúp vào ô (hoặc F2) để sửa; Ctrl+Enter hoặc “Lưu” để lưu, Esc huỷ. Ô có danh sách thì bấm một lần để chọn.', 'Ô có biểu tượng khoá lấy từ Jira, chỉ xem.', '“N ô cần sửa” trên mỗi nhóm đưa bạn tới ô còn lỗi.', 'Nháp AI (chữ tím) phải được duyệt mới vào báo cáo.'] },
  { k:'ai', ic:'✦', t:'Trợ lý AI', d:'Nháp, căn cứ và hỏi đáp', s:['Bấm nút ✦ AI trên thanh công cụ để xem nháp chờ duyệt.', 'Bấm “AI soạn ra sao?” để xem AI dựa vào câu nào trong Progress Report.', 'Có thể hỏi: “Tóm tắt tuần này”, “I.A.5.1 có rủi ro gì?”.'] },
  { k:'exp', ic:'⤓', t:'Chốt & xuất báo cáo', d:'Lưu thành bản và tải file Excel', s:['Bấm “Xuất báo cáo” ở góc trên.', 'Gõ tên người chốt để lưu thành một bản. Việc còn dở chỉ là cảnh báo, vẫn chốt được.', 'Tải file Excel từ đúng bản đã chốt.'] },
  { k:'ver', ic:'◷', t:'Phiên bản', d:'Xem lại bản đã chốt và lúc nào đã sửa gì', s:['Khối So sánh ở trên cho thấy tình trạng dự án tốt lên hay xấu đi giữa 2 bản.', 'Bên dưới là các bản đã chốt theo tuần — bấm một bản để xem nhanh tổng quan.', '“Mở trên bảng” mở bản cũ lên bảng; chốt lại thành bản mới.'] },
  { k:'log', ic:'≡', t:'Nhật ký', d:'Ai đã làm gì, lúc nào', s:['Lọc theo loại việc hoặc chỉ cảnh báo.', 'Tìm theo mã dự án để xem lịch sử của dự án đó.'] }
];

export const KEYS: readonly (readonly [string, string])[] = [['F2 / nhấp đúp', 'Sửa ô'], ['Esc', 'Huỷ / đóng'], ['Tab', 'Sang ô bên phải'], ['Shift + bấm', 'Chọn vùng'], ['Ctrl + cuộn', 'Phóng to / thu nhỏ bảng'], ['Alt + ← / →', 'Quay lại / tiến tới màn'], ['Ctrl + Z', 'Hoàn tác']];

export const FAQ: readonly (readonly [string, string])[] = [
  ['Sửa báo cáo đã chốt thế nào?', 'Vào Phiên bản → chọn bản → “Mở trên bảng”. Chốt lại sẽ thành bản mới, bản cũ giữ nguyên.'],
  ['AI lấy thông tin ở đâu?', 'Từ Progress Report và comment trong file Jira bạn nhập. AI chỉ soạn nháp; bạn duyệt mới vào báo cáo.']
];

export const PA_LONG: readonly FieldId[] = ['muctieu', 'kpi', 'milestone'];


/* Dữ liệu theo kỳ báo cáo do máy chủ cấp (GET /cycles/active): ngày báo cáo và các tuần đã tới. Cập nhật tại chỗ để mọi nơi đọc `TODAY` / `WEEKS` thấy ngay. */
export let TODAY = new Date(2026, 10, 22);
export const WEEKS: { k: WeekKey; name: string; cur?: boolean }[] = [];

export function setCycle(todayIso: string, weeks: { k: string; name: string; cur: boolean; future: boolean }[]): void {
  const [y, m, d] = todayIso.split('-').map(Number);
  TODAY = new Date(y, m - 1, d);
  WEEKS.splice(0, WEEKS.length, ...weeks.filter((w) => !w.future).reverse().map((w) => ({ k: w.k as WeekKey, name: w.name, cur: w.cur || undefined })));
}

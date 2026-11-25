import type { AiFieldId, Field, FieldGroup, FieldId, ImportFileMeta, TestScenario, TourKey, TourStep, VersionItem, WeekKey } from '@/types';


export const STAGES: readonly string[] = ['Xác định bài toán AI & Ý tưởng sản phẩm','Xác định yêu cầu nghiệp vụ chi tiết (PRD)','Khảo sát & chuẩn bị dữ liệu',
  'Thiết kế giải pháp','Huấn luyện mô hình','Đánh giá mô hình','Phát triển phần mềm','Tích hợp Software & Event Logging',
  'Kiểm thử & UAT','Đánh giá An ninh Bảo mật (ANBM)','Phê duyệt & Triển khai Go-Live','Đánh giá sau Go-Live (Post-Launch Report)'];

export const GROUPS: { k: string; name: string }[] = [
  {
    "k": "I.A.3",
    "name": "I.A.3.PAI – Cá nhân hóa trải nghiệm cho từng khách"
  },
  {
    "k": "I.A.4",
    "name": "I.A.4.Tối ưu Food & Express"
  },
  {
    "k": "I.A.5",
    "name": "I.A.5.Tối ưu khuyến mại và thông báo"
  },
  {
    "k": "I.A.6",
    "name": "I.A.6. An toàn & Cá nhân hóa thống nhất & nâng cao"
  },
  {
    "k": "I.C.1",
    "name": "I.C.1.Bộ giải pháp Điều phối Cung-Cầu và Tối ưu Phát cuốc"
  },
  {
    "k": "I.C.2",
    "name": "I.C.2.Tối ưu Điều phối & Định giá – Dịch vụ Ride"
  },
  {
    "k": "II.A.1",
    "name": "II.A.1.Tài xế cung cấp dịch vụ 5-sao"
  },
  {
    "k": "II.A.2",
    "name": "II.A.2.AI Hỗ trợ Tài xế (Data Science)"
  },
  {
    "k": "II.B.1",
    "name": "II.B.1Quản lý phương tiện toàn diện"
  },
  {
    "k": "II.D.1",
    "name": "II.D.1Marketplace Trust System"
  },
  {
    "k": "II.D.2",
    "name": "II.D.2.AI Quản trị"
  },
  {
    "k": "II.E.1",
    "name": "II.E.1Nền tảng MLOps cho triển khai khoa học dữ liệu và máy học"
  },
  {
    "k": "II.I.1",
    "name": "II.I.1Setup, tổng hợp và chuẩn hóa các công cụ công nghệ phục vụ trung tâm MOC"
  },
  {
    "k": "I.A.7",
    "name": "I.A.7 · (mã mới, chưa có trong mẫu)"
  },
  {
    "k": "II.B.2",
    "name": "II.B.2 · (mã mới, chưa có trong mẫu)"
  }
];

export const GRP: Record<FieldGroup, string> = {
  pin: 'Dự án', info: 'Thông tin dự án', prog: 'Tiến độ & trạng thái', org: 'Đơn vị & nhân sự', eval: 'Phân loại & đánh giá',
  w1: 'Tuần 01/11 · 31/10–06/11 · đã chốt', w2: 'Tuần 02/11 · 07–14/11 · đã chốt',
  w3: 'Tuần 3/11 · 15–22/11 · tuần này', w4: 'Tuần 4/11 · 23–30/11 · chưa tới'
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

/* bản thử cố định ngày báo cáo: 20/11/2026 */
export const TODAY = new Date(2026, 10, 20);

export const STATUS_VALUES: readonly string[] = ['Chưa thực hiện','Đang thực hiện','Đã hoàn thành','Tạm dừng','Hủy'];

export const STATUS_MAP: Record<string, string> = { 'TO DO':'Chưa thực hiện', 'IN PROGRESS':'Đang thực hiện', 'MONITORING':'Đang thực hiện', 'DONE':'Đã hoàn thành', 'PENDING':'Tạm dừng', 'CANCELED':'Hủy' };

export const PROG_VALUES: readonly string[] = ['Đúng tiến độ','Chậm tiến độ','Tạm dừng'];

export const PROG_MAP: Record<string, string> = { 'On-track':'Đúng tiến độ', 'Off-track':'Chậm tiến độ' };

/* mã giai đoạn (1-12) của từng giá trị Custom field (Phase) có trong bộ GOLD */
export const PHASE_BUCKET: Record<string, number> = {
  "1.Xác.định.bài.toán.AI": 1,
  "2.Xác.định.yêu.cầu.nghiệp.vụ.chi.tiết": 2,
  "3.Khảo.sát.dữ.liệu": 3,
  "4.Thiết.kế.giải.pháp": 4,
  "5.Huấn.luyện.mô.hình": 5,
  "6.Đánh.giá.mô.hình": 6,
  "7.Phát.triển.phần.mềm": 7,
  "8.Tích.hợp.Software.&.Event.Logging": 8,
  "9.Kiểm.thử.UAT": 9,
  "10.Đánh.giá.ANBM": 10,
  "11.Go-live": 11,
  "12.Đánh.giá.sau.Go-live": 12,
  "10. Triển khai thử nghiệm (Pilot)": 10,
  "9. Kiểm thử chất lượng (SIT/UAT/A-B Test)": 9,
  "2. Đặc tả yêu cầu nghiệp vụ": 2,
  "7. Đóng gói mô hình và phát triển API": 7,
  "8. Tích hợp phần mềm và ghi log sự kiện": 8,
  "5. Chuẩn bị và xử lý dữ liệu": 5,
  "11. Đưa vào vận hành (Go-Live)": 11,
  "3. Thiết kế kiến trúc giải pháp": 3,
  "6. Huấn luyện và tinh chỉnh mô hình": 6,
  "4. Thiết kế giao diện (UI/UX)": 4,
  "12. Vận hành, giám sát và tối ưu liên tục": 12
};

export const WEEKS: { k: WeekKey; name: string; cur?: boolean }[] = [
  { k:'w3', name:'Tuần 3/11 · 15–22/11', cur:true },
  { k:'w2', name:'Tuần 02/11 · 07–14/11' },
  { k:'w1', name:'Tuần 01/11 · 31/10–06/11' }
];

export const SEED_VERSIONS: VersionItem[] = [
  { wk:'w2', v:2, by:'Khuê', at:'14/11 16:20', note:'Sửa sau họp khối: cập nhật rủi ro II.E.1.2', exported:'20261114_DAN_Bao-cao-PMO.xlsx',
    stats:{ rows:38, hand:6, ai:114 }, changes:[['II.E.1.2','AC Mức độ rủi ro','Thấp','Trung bình'],['II.E.1.2','AT Vấn đề, rủi ro…','Không có','Xin lùi golive sang 15/11 vì chờ PD DPO, ANBM'],['I.C.1.2','J Tiến độ','Đúng tiến độ','Chậm tiến độ']] },
  { wk:'w2', v:1, by:'Khuê', at:'13/11 17:05', note:'Bản gửi trước họp', exported:'20261113_DAN_Bao-cao-PMO.xlsx', stats:{ rows:38, hand:4, ai:114 }, changes:[] },
  { wk:'w1', v:1, by:'Tuấn', at:'07/11 09:40', note:'', exported:'20261107_DAN_Bao-cao-PMO.xlsx', stats:{ rows:37, hand:9, ai:111 }, changes:[] }
];

/* kịch bản dữ liệu thử (menu "Dữ liệu thử"); tên/mô tả là bản cuối sau các vòng góp ý */
export const SCEN: Record<Exclude<TestScenario, null>, { name: string; d: string }> = {
  dirty: { name: 'Jira bẩn định dạng', d: 'Progress Report có *đậm*, {{ngày}}, gạch đầu dòng lẫn lộn, link wiki, khoảng trắng thừa; Status/Progress viết khác kiểu' },
  risk: { name: 'Nhiều rủi ro', d: '1/3 dự án có Comment “Risk:”, vài dự án quá hạn — xem tô đỏ và mức rủi ro' },
  perfect: { name: 'File Jira mẫu (Clean 64DA)', d: 'File export: 112 issue, 64 epic dự án' },
  errors: { name: 'File có lỗi', d: 'Dữ liệu giả lập có issue thiếu mã, giá trị lạ, ô trống, mã trùng — để thử Agent tự xử lý' },
  many: { name: 'Nhiều dự án (giả lập)', d: '39 dự án giả lập theo mẫu báo cáo, để xem bảng khi đầy dữ liệu' }
};

/* Hướng dẫn tương tác (bản gọn: 3 bước Nhập file → Điền & duyệt → Chốt & xuất, không có bước Kiểm tra).
   `view` / `ver` thay cho hàm prep của prototype: màn cần mở sẵn trước khi chạy bước. */
const T_WELCOME: TourStep = { id: 'welcome', t: 'Chào mừng tới PMO Reporting', b: 'Công cụ biến file Jira export thành báo cáo tuần 49 cột theo đúng mẫu của khối. Hướng dẫn này đi qua từng phần trong khoảng 1 phút. Dùng phím → và ← để chuyển bước, Esc để thoát.' };
const T_STEPS: TourStep = { id: 'steps', sel: 'nav[aria-label="Các bước"]', t: 'Ba bước mỗi tuần', b: 'Nhập file → Điền & duyệt → Chốt & xuất. Bấm vào bước nào thì tới bước đó, hoặc dùng nút ‹ › để lùi hay tiến từng bước — lùi lại không làm mất gì.' };
const T_IMPORT: TourStep = { id: 'imp', sel: '#dropzone', view: 'import', t: 'Bước 1 · Nhập file', b: 'Kéo file CSV export từ Jira vào đây, hoặc bấm “Dùng dữ liệu mẫu”. Công cụ đọc 277 cột của file, gộp cột trùng tên và so với lần nhập trước.' };
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

export const WK_TXT: Record<WeekKey, [string, string, string]> = { w1: ['w1ht', 'w1kh', 'w1vd'], w2: ['w2ht', 'w2kh', 'w2vd'], w3: ['ht', 'kh', 'vd'] };

export const WK_TXT_N: readonly string[] = ['Công việc đã hoàn thành trong tuần', 'Kế hoạch tuần sau', 'Vấn đề, rủi ro và đề xuất'];

export const CMP_F: readonly string[] = ['tt', 'td', 'tt1', 'rui', 'buoc', 'action', 'nextstep', 'giatri', 'end', 'pic'];

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
  { k:'imp', ic:'⤒', t:'Nhập file Jira', d:'Đưa file export vào và kiểm tra cột', s:['Bấm “Nhập file”, kéo file CSV/Excel export từ Jira vào, hoặc dùng dữ liệu mẫu.', 'Xem phần tóm tắt: cột nào lấy từ trường Jira nào (mapping).'] },
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

export const JIRA_OF: Partial<Record<FieldId, string>> = { viec: 'Summary', mang: 'Labels', muctieu: 'Description', kpi: 'Custom field (KPI/Outcome)', pic: 'Custom field (Tech lead)',
  start: 'Custom field (Start date)', end: 'Due date', gdk: 'Custom field (Team Name)', po: 'Custom field (PO)' };

export const NO_JIRA: readonly FieldId[] = ['phong', 'tp', 'bo', 'aieng', 'airs', 'mlops', 'swe'];

export const PA_LONG: readonly FieldId[] = ['muctieu', 'kpi', 'milestone'];

/* "Lần nhập gần nhất" ở bước 1 (prototype IMPORTS L7076) */
export const IMPORTS: ImportFileMeta[] = [
  { name: 'Jira_PMO_bao-cao-tuan_14-11.csv', wk: 'Tuần 02/11 · 07–14/11', at: '14/11 16:02', by: 'Khuê', issues: 39, cols: 277, prj: 38, ver: 'v2 đã chốt' },
  { name: 'Jira_PMO_bao-cao-tuan_07-11.csv', wk: 'Tuần 01/11 · 31/10–06/11', at: '07/11 09:12', by: 'Tuấn', issues: 38, cols: 276, prj: 37, ver: 'v1 đã chốt' }
];

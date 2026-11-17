import type { DemoData, Field, GroupId } from '@/types';
import demoJson from './demo.json';

export const DEMO = demoJson as unknown as DemoData;

export const STAGES = [
  'Xác định bài toán AI & Ý tưởng sản phẩm', 'Xác định yêu cầu nghiệp vụ chi tiết (PRD)', 'Khảo sát & chuẩn bị dữ liệu',
  'Thiết kế giải pháp', 'Huấn luyện mô hình', 'Đánh giá mô hình', 'Phát triển phần mềm', 'Tích hợp Software & Event Logging',
  'Kiểm thử & UAT', 'Đánh giá An ninh Bảo mật (ANBM)', 'Phê duyệt & Triển khai Go-Live', 'Đánh giá sau Go-Live (Post-Launch Report)',
];
export const STAGE_KNOWN = [1, 2, 8, 10, 11, 12];

export const GROUPS = Object.keys(DEMO.workstream)
  .map((k) => ({ k, name: DEMO.workstream[k] }))
  .concat([
    { k: 'I.A.7', name: 'I.A.7 · (mã mới, chưa có trong mẫu)' },
    { k: 'II.B.2', name: 'II.B.2 · (mã mới, chưa có trong mẫu)' },
  ]);
export const UNASSIGNED = '— chưa gán —';
export const JIRA_COLS = [UNASSIGNED, ...DEMO.fileCols];

export const GRP: Record<GroupId, string> = {
  pin: 'Dự án', info: 'Thông tin dự án', prog: 'Tiến độ & trạng thái', org: 'Đơn vị & nhân sự', eval: 'Phân loại & đánh giá',
  w1: 'Tuần 01/11 · 31/10–06/11 · đã chốt', w2: 'Tuần 02/11 · 07–14/11 · đã chốt',
  w3: 'Tuần 3/11 · 15–22/11 · tuần này', w4: 'Tuần 4/11 · 23–30/11 · chưa tới',
};

export const LEVELS = ['Thấp', 'Trung bình', 'Cao'];
export const MARKETS = ['VN', 'Indo', 'Malay', 'Thái', 'Phil', 'Sing', 'Toàn khu vực'];
export const DOMAINS = ['Food', 'Ride', 'Express', 'Driver', 'Fleet', 'Payment', 'Platform'];

/** 49 cột theo file mẫu 20261111_DAN_Mau-bao-cao-PMO.xlsx (A → AW). Mã DA và Công việc ghim bên trái. */
export const FIELDS: Field[] = [
  { col: 'B', id: 'code', name: 'Mã DA', grp: 'pin', kind: 'jira', src: 'tách mã đầu Summary', w: 92, key: true, required: true },
  { col: 'C', id: 'task', name: 'Công việc', grp: 'pin', kind: 'cfg', src: 'Hệ thống', w: 230, required: true },
  { col: 'A', id: 'workstream', name: 'Mảng việc', grp: 'info', kind: 'cfg', src: 'Hệ thống (theo Mã DA)', w: 210, required: true },
  { col: 'D', id: 'objective', name: 'Mục tiêu', grp: 'info', kind: 'cfg', src: 'Hệ thống', w: 200 },
  { col: 'E', id: 'kpi', name: 'KPI', grp: 'info', kind: 'cfg', src: 'Hệ thống', w: 150 },
  { col: 'F', id: 'pic', name: 'PIC', grp: 'info', kind: 'cfg', src: 'Hệ thống · đối chiếu Jira Assignee #1', w: 130, required: true },
  { col: 'G', id: 'start', name: 'Ngày bắt đầu', grp: 'info', kind: 'cfg', src: 'Hệ thống', w: 118 },
  { col: 'H', id: 'end', name: 'Ngày kết thúc', grp: 'info', kind: 'cfg', src: 'Hệ thống', w: 118 },
  { col: 'I', id: 'status', name: 'Trạng thái', grp: 'prog', kind: 'bucket', src: 'Status', w: 130, required: true },
  { col: 'J', id: 'progress', name: 'Tiến độ', grp: 'prog', kind: 'bucket', src: 'Custom field (Progress)', w: 120, required: true },
  { col: 'K', id: 'milestone', name: 'Milestone', grp: 'prog', kind: 'jira', src: 'Description › Milestone', w: 140 },
  { col: 'L', id: 'lifecycleStepNo', name: 'Bước trong AI Lifecycle', grp: 'prog', kind: 'bucket', src: 'Custom field (Phase)', w: 130, required: true },
  { col: 'M', id: 'output', name: 'Output', grp: 'prog', kind: 'jira', src: 'Tài liệu AI Lifecycle (chưa có)', w: 160 },
  { col: 'N', id: 'note', name: 'Note', grp: 'prog', kind: 'manual', src: 'nhập tay · tự thêm lý do chỉnh tay', w: 180 },
  { col: 'O', id: 'divisionHead', name: 'GĐK QLTT', grp: 'org', kind: 'cfg', src: 'Hệ thống (theo Mảng việc) · đối chiếu Jira Team Name', w: 120 },
  { col: 'P', id: 'department', name: 'Phòng chịu trách nhiệm', grp: 'org', kind: 'cfg', src: 'Hệ thống (theo Mảng việc)', w: 150 },
  { col: 'Q', id: 'deptHead', name: 'TP', grp: 'org', kind: 'cfg', src: 'Hệ thống (theo Mảng việc)', w: 120 },
  { col: 'R', id: 'businessOwner', name: 'Business Owner', grp: 'org', kind: 'cfg', src: 'Hệ thống', w: 120 },
  { col: 'S', id: 'po', name: 'Product Owner', grp: 'org', kind: 'cfg', src: 'Hệ thống · đối chiếu Jira Assignee #2', w: 150 },
  { col: 'T', id: 'aiEngineer', name: 'AI Engineer (ML/Opt/Algo/LLM/DS)', grp: 'org', kind: 'cfg', src: 'Hệ thống', w: 150 },
  { col: 'U', id: 'aiResearcher', name: 'AI researcher', grp: 'org', kind: 'cfg', src: 'Hệ thống', w: 120 },
  { col: 'V', id: 'mlopsEngineer', name: 'Data/MLOps Engineer', grp: 'org', kind: 'cfg', src: 'Hệ thống', w: 140 },
  { col: 'W', id: 'softwareEngineer', name: 'BE/FE/DevOps (Software Engineer)', grp: 'org', kind: 'cfg', src: 'Hệ thống', w: 160 },
  { col: 'X', id: 'x', name: '(cột trống trong mẫu)', grp: 'org', kind: 'none', src: 'mẫu không đặt tên', w: 100 },
  { col: 'Y', id: 'initiativeType', name: 'Cải tiến/Xây mới', grp: 'eval', kind: 'manual', src: 'nhập tay', w: 120, opts: ['Cải tiến', 'Xây mới'] },
  { col: 'Z', id: 'prio', name: 'Priority (Final)', grp: 'eval', kind: 'manual', src: 'nhập tay', w: 100, opts: ['P1', 'P2', 'P3'] },
  { col: 'AA', id: 'statusAlt', name: 'TRẠNG THÁI 1', grp: 'eval', kind: 'calc', src: 'quá Due date chưa xong = chậm', w: 200 },
  { col: 'AB', id: 'businessValue', name: 'Giá trị mang lại của dự án', grp: 'eval', kind: 'manual', src: 'chọn từ danh sách · mặc định Trung bình', w: 130, required: true, opts: LEVELS },
  { col: 'AC', id: 'riskLevel', name: 'Mức độ rủi ro', grp: 'eval', kind: 'ai', src: 'AI đánh giá · sửa tay được', w: 130, required: true },
  { col: 'AD', id: 'action', name: 'Action', grp: 'eval', kind: 'manual', src: 'nhập tay', w: 100, opts: ['Đi tiếp', 'Đã đóng', 'Tạm dừng'] },
  { col: 'AE', id: 'nextStep', name: 'Đề xuất Next Step', grp: 'eval', kind: 'manual', src: 'nhập tay', w: 190,
    opts: ['Tiếp tục Duy trì (Maintain)', 'Mở rộng Quy mô (Scale)', 'Dừng / Đóng dự án'] },
  { col: 'AF', id: 'projectType', name: 'Loại dự án', grp: 'eval', kind: 'manual', src: 'nhập tay', w: 110, required: true },
  { col: 'AG', id: 'link', name: 'Link Confluence', grp: 'eval', kind: 'manual', src: 'nhập tay', w: 170 },
  { col: 'AH', id: 'domain', name: 'Domain', grp: 'eval', kind: 'manual', src: 'chọn từ danh sách', w: 100, opts: DOMAINS },
  { col: 'AI', id: 'market', name: 'Market', grp: 'eval', kind: 'manual', src: 'chọn từ danh sách', w: 100, required: true, opts: MARKETS },
  { col: 'AJ', id: 'lifecycleStep', name: 'AI Lifecycle', grp: 'eval', kind: 'bucket', src: 'Custom field (Phase)', w: 200, required: true },
  { col: 'AK', id: 'valueEstimate', name: 'Ước tính chi tiết giá trị mang lại', grp: 'eval', kind: 'manual', src: 'nhập tay', w: 200 },
  { col: 'AL', id: 'w1Done', name: 'Công việc đã hoàn thành trong tuần', grp: 'w1', kind: 'report', src: 'Progress Report · Tiến độ · Tuần 01/11', w: 230 },
  { col: 'AM', id: 'w1Plan', name: 'Kế hoạch tuần sau', grp: 'w1', kind: 'report', src: 'Progress Report · Công việc sẽ làm', w: 210 },
  { col: 'AN', id: 'w1Issues', name: 'Vấn đề, rủi ro và Đề xuất giải pháp', grp: 'w1', kind: 'past', src: 'bản đã chốt Tuần 01/11', w: 200 },
  { col: 'AO', id: 'w2Done', name: 'Công việc đã hoàn thành trong tuần', grp: 'w2', kind: 'report', src: 'Progress Report · Tiến độ · Tuần 02/11', w: 230 },
  { col: 'AP', id: 'w2Plan', name: 'Kế hoạch tuần sau', grp: 'w2', kind: 'report', src: 'Progress Report · Công việc sẽ làm', w: 210 },
  { col: 'AQ', id: 'w2Issues', name: 'Vấn đề, rủi ro và Đề xuất giải pháp', grp: 'w2', kind: 'past', src: 'bản đã chốt Tuần 02/11', w: 200 },
  { col: 'AR', id: 'w3Done', name: 'Công việc đã hoàn thành trong tuần', grp: 'w3', kind: 'report', src: 'Progress Report · Tiến độ · Tuần 3/11', w: 240 },
  { col: 'AS', id: 'w3Plan', name: 'Kế hoạch tuần sau', grp: 'w3', kind: 'ai', src: 'AI đọc Progress Report · Công việc sẽ làm', w: 230 },
  { col: 'AT', id: 'w3Issues', name: 'Vấn đề, rủi ro và Đề xuất giải pháp', grp: 'w3', kind: 'ai', src: 'AI đọc Progress Report + Comment', w: 240, required: true },
  { col: 'AU', id: 'w4Done', name: 'Công việc đã hoàn thành trong tuần', grp: 'w4', kind: 'future', src: 'chưa tới tuần', w: 180 },
  { col: 'AV', id: 'w4Plan', name: 'Kế hoạch tuần sau', grp: 'w4', kind: 'future', src: 'chưa tới tuần', w: 160 },
  { col: 'AW', id: 'w4Issues', name: 'Vấn đề, rủi ro và Đề xuất giải pháp', grp: 'w4', kind: 'future', src: 'chưa tới tuần', w: 180 },
];

export const FIELD_BY_ID: Record<string, Field> = Object.fromEntries(FIELDS.map((f) => [f.id, f]));
export const fieldById = (id: string): Field => FIELD_BY_ID[id];

export const AI_IDS = ['riskLevel', 'w3Plan', 'w3Issues'] as const;
/** bản thử cố định ngày báo cáo: 20/11/2026 */
export const TODAY = new Date(2026, 10, 20);

export const STATUS_VALUES = ['Chưa thực hiện', 'Đang thực hiện', 'Đã hoàn thành', 'Tạm dừng', 'Hủy'];
export const BASE_STATUS_MAP: Record<string, string> = {
  'TO DO': 'Chưa thực hiện', 'IN PROGRESS': 'Đang thực hiện', MONITORING: 'Đang thực hiện',
  DONE: 'Đã hoàn thành', PENDING: 'Tạm dừng', CANCELED: 'Hủy',
};
export const PROG_VALUES = ['Đúng tiến độ', 'Chậm tiến độ', 'Tạm dừng'];
export const BASE_PROG_MAP: Record<string, string> = { 'On-track': 'Đúng tiến độ', 'Off-track': 'Chậm tiến độ' };
export const OVR_OPTS: Record<string, string[]> = { status: STATUS_VALUES, progress: PROG_VALUES };
export const OVR_RAW: Record<string, string> = { status: 'rawStatus', progress: 'rawProgress' };

export const PHASE_UNSORTED = ['TBD'];
export const BASE_PHASE_BUCKET: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  DEMO.phases.concat(DEMO.rows.map((r) => r.rawPhase)).forEach((ph) => {
    if (!PHASE_UNSORTED.includes(ph) && !m[ph]) m[ph] = parseInt(ph, 10) || 2;
  });
  return m;
})();

export const SYS_UNIT = ['divisionHead', 'department', 'deptHead'];
export const SYS_PROJ = ['task', 'objective', 'kpi', 'pic', 'start', 'end', 'businessOwner', 'po', 'aiEngineer', 'aiResearcher', 'mlopsEngineer', 'softwareEngineer'];
export const SYS_ORDER = ['workstream', 'code', 'task', 'objective', 'kpi', 'pic', 'start', 'end', 'divisionHead', 'department', 'deptHead', 'businessOwner', 'po', 'aiEngineer', 'aiResearcher', 'mlopsEngineer', 'softwareEngineer'];
export const SYS_PEOPLE = ['pic', 'deptHead', 'businessOwner', 'po', 'aiEngineer', 'aiResearcher', 'mlopsEngineer', 'softwareEngineer'];
export const ORG_JIRA: Record<string, string> = { pic: 'Assignee #1', po: 'Assignee #2', divisionHead: 'Team Name' };
export const DEPARTMENT_OF: Record<string, string> = {
  'I.A': 'P. AI Food & Express', 'I.C': 'P. AI Ride', 'II.A': 'P. AI Tài xế', 'II.B': 'P. AI Phương tiện',
  'II.D': 'P. Nền tảng & Quản trị', 'II.E': 'P. MLOps', 'II.I': 'P. Công cụ MOC',
};

export const WEEKS = [
  { k: 'w3', name: 'Tuần 3/11 · 15–22/11', cur: true },
  { k: 'w2', name: 'Tuần 02/11 · 07–14/11', cur: false },
  { k: 'w1', name: 'Tuần 01/11 · 31/10–06/11', cur: false },
];

export const ORPHANS = [{ key: 'PKD-202', sum: '[Bug] Lỗi đồng bộ event tracking trên Staging' }];

export const TEXT_COLORS = [null, '#B91C1C', '#C2410C', '#A16207', '#15803D', '#1D4ED8', '#6D28D9', '#C9276D'];
export const FILL_COLORS = [null, '#FEF3C7', '#FEE2E2', '#FFEDD5', '#DCFCE7', '#DBEAFE', '#EDE9FE', '#FCE7F3'];

export const STORAGE = {
  cat: 'pmo-sys-v3', cfg: 'pmo-proto-cfg-v2', cols: 'pmo-proto-cols-v5', tour: 'pmo-tour-v1',
} as const;

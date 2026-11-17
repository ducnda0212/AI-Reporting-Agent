import type { Tpl, TplStatus } from '@/store/types';

/** Thư viện mẫu báo cáo (mock). `t49` mở màn cấu hình cột, `texec` mở màn Điều hành, còn lại mở bản xem nháp. */
export const SEED_TPLS: Tpl[] = [
  { id: 't49', name: 'Báo cáo tuần chi tiết', file: '20261111_DAN_Mau-bao-cao-PMO.xlsx', fmt: 'xlsx', size: '49 cột · A → AW', st: 'use', main: true, used: 'Tuần 3/11', by: 'PMO khối', at: '11/11/2026', desc: 'Mỗi dự án một dòng, khối tuần AL → AW. Dùng cho họp khối hằng tuần.' },
  { id: 'texec', name: 'Báo cáo điều hành', file: 'PMO_Bao_cao_dieu_hanh_template.xlsx', fmt: 'docx', size: '7 mục · Word/PDF', st: 'use', used: 'Tuần 3/11', by: 'PMO khối', at: '11/11/2026', desc: 'Tóm tắt cho lãnh đạo, dựng từ cùng dữ liệu với mẫu chi tiết.' },
  { id: 'tred', name: 'Dự án cần chú ý cho lãnh đạo', file: '', fmt: 'xlsx', size: '8 cột · lọc dự án đỏ', st: 'draft', used: '', by: 'Khuê', at: '16/11/2026', desc: 'Chỉ dự án Đỏ và P1: PIC, tiến độ, rủi ro chính, đề xuất.',
    cols: ['Mã DA', 'Công việc', 'PIC', 'Tiến độ', 'Mức độ rủi ro', 'Rủi ro chính', 'Đề xuất', 'Hạn xử lý'] },
  { id: 't49old', name: 'Báo cáo tuần chi tiết (tháng 10)', file: '20261001_DAN_Mau-bao-cao-PMO.xlsx', fmt: 'xlsx', size: '49 cột · A → AW', st: 'arch', used: 'Tuần 4/10', by: 'PMO khối', at: '01/10/2026', desc: 'Bản tháng trước, giữ lại để mở các bản chốt cũ.' },
];

export const TPL_STATUS: Record<TplStatus, ['ok' | 'w' | 'mut', string]> = {
  use: ['ok', 'Đang dùng'], draft: ['w', 'Nháp'], arch: ['mut', 'Lưu trữ'],
};

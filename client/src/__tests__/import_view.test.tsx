import { beforeEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { castDraft } from 'immer';
import { ImportView } from '@/views/Import/ImportView';
import { FIELDS } from '@/data/constants';
import { mutate, resetStore } from '@/store';
import { loadFixture, MAPPING } from './fixtures';

describe('ImportView (máy chủ thật + thanh mapping)', () => {
  beforeEach(() => resetStore());

  it('trước khi nạp: ô kéo thả, không còn nút dữ liệu mẫu; lịch sử rỗng báo chưa có lần nhập', () => {
    const html = renderToString(<ImportView />);
    expect(html).toContain('Chọn file CSV / Excel');
    expect(html).not.toContain('Dùng dữ liệu mẫu');
    expect(html).toContain('Chưa có lần nhập nào');
  });

  it('file đã chọn kèm lỗi nhập: vẫn có nút Đọc file này và khung lỗi role=alert', () => {
    mutate((d) => { d.pv = { name: 'sai.csv', size: 10, ext: 'csv', loading: false, done: false, kind: 'csv', sheets: [{ name: 's', rows: [['a']], nCols: 1, nData: 0 }] }; d.importErr = 'File thiếu cột Summary hoặc Issue key'; });
    const html = renderToString(<ImportView />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('File thiếu cột Summary hoặc Issue key');
    expect(html).toContain('Đọc file này');
  });

  it('lịch sử lấy từ máy chủ: nút nhập lại file gần nhất', () => {
    mutate((d) => { d.impHist = [{ session_id: 's1', name: 'jira_14-11.csv', wk: 'Tuần 2', at: '14/11 16:02', by: 'Khuê', issues: 39, cols: 277, prj: 38, ver: '' }]; });
    const html = renderToString(<ImportView />);
    expect(html).toContain('jira_14-11.csv');
    expect(html).toContain('Nhập lại file này');
  });

  it('đã nạp: mpBar, đủ 49 cột, mapQuick cho đúng các cột mappable', () => {
    loadFixture();
    mutate((d) => { d.fileCols = ['Summary', 'Assignee', 'Custom field (Department)']; d.mpSrc = { phong: 'Assignee' }; d.mpDirty = true; });
    const html = renderToString(<ImportView />);
    expect(html).toContain('class="mpbar"');
    for (const t of ['Nhân bản', 'Lưu thành cấu hình mới', '49 cột', 'khớp 42/49 cột · đã sửa, chưa lưu', 'Cập nhật “Hệ thống”']) expect(html).toContain(t);
    expect(html).not.toContain('Đặt mặc định'); // đã là mặc định
    expect(html.match(/class="sel issel"/g)).toHaveLength(49); // mọi cột đều đổi được nguồn
    expect(FIELDS.length).toBe(49);
    for (const t of ['Chưa chọn cột Jira', 'Mặc định ·', 'Mặc định của hệ thống']) expect(html).not.toContain(t);
    for (const t of ['Tách mã DA ở đầu cột', 'Phần trước mục MILESTONE', 'Tự tính từ Trạng thái']) expect(html).toContain(t);
    expect(html).toContain('<option value="">Không lấy từ Jira</option>');
    expect(html).toContain('<option value="Custom field (Department)">');
    expect(html).toContain('<option value="Assignee" selected="">Assignee</option>');
  });

  it('cấu hình không mặc định có thêm Đặt mặc định và Xoá; đang gọi máy chủ thì khoá nút', () => {
    loadFixture();
    mutate((d) => { d.mappings = castDraft([{ ...MAPPING, is_default: false }]); d.busy = true; });
    const html = renderToString(<ImportView />);
    expect(html).toContain('Đặt mặc định');
    expect(html).toContain('>Xoá<');
    expect(html).toMatch(/<button class="btn sm" disabled="">Nhân bản/);
  });

  it('cấu hình hệ thống không bao giờ xoá được, kể cả khi không còn là mặc định', () => {
    loadFixture();
    mutate((d) => { d.mappings = castDraft([{ ...MAPPING, is_default: false }]); });
    expect(renderToString(<ImportView />)).toMatch(/<button class="btn sm" disabled=""[^>]*>Xoá</);
    mutate((d) => { d.mappings = castDraft([{ ...MAPPING, id: 'map_x', name: 'Mới', is_default: false }]); d.mpUsed = 'map_x'; });
    expect(renderToString(<ImportView />)).toMatch(/<button class="btn sm"( title="[^"]*")?>Xoá</);
  });
});

/* Lệnh sửa của Agent: mã dự án không có trong file thì báo rõ và không sửa gì; lệnh hàng loạt theo phạm vi, nhiều mã trong một lệnh, xóa ô, soạn bằng AI. */
import { describe, expect, it } from 'vitest';
import { askAnswer } from '@/lib/ai';
import { PHASE_BUCKET, baseRows } from './fixtures';

const rows = baseRows();
const ctx = { phaseBucket: PHASE_BUCKET, rows, allRows: rows, sel: null };
const A = (q: string) => askAnswer(q, ctx);

describe('lệnh sửa có mã không có trong file', () => {
  for (const q of ['Sửa Mức độ rủi ro của DA02 thành Cao', 'Điền ghi chú cho DA03: chờ khách hàng xác nhận', 'Đánh dấu DA01, DA02 là rủi ro cao', 'Duyệt các ô AI của DA01', 'Đổi Tiến độ của I.A.9.9 thành Chậm tiến độ']) {
    it(q, () => { const r = A(q); expect(r.html).toContain('Không có dự án mã'); expect(r.stagedItems).toHaveLength(0); expect(r.html).toContain('chưa sửa gì'); });
  }
  it('mã nằm trong nội dung ghi chú không bị coi là mã dự án', () => {
    expect(A('Điền ghi chú cho ' + rows[0].ma + ': chờ họp Q3 và PRJ12').html).not.toContain('Không có dự án mã');
  });
});

describe('lệnh hàng loạt', () => {
  it('Đổi … cho tất cả dự án: đưa mọi dự án vào bản xem trước', () => {
    const r = A('Đổi Note "Chờ CBLD" cho tất cả dự án');
    expect(r.stagedItems).toHaveLength(rows.length);
    expect(r.stagedItems.every((x) => x.to === 'Chờ CBLD' && x.kind === 'edit')).toBe(true);
  });
  it('cho các dự án đang trống: chỉ ô trống', () => {
    const r = A('Điền Note "Chờ CBLD" cho các dự án đang trống');
    expect(r.stagedItems.length).toBeGreaterThan(0);
    expect(r.stagedItems.every((x) => !x.from)).toBe(true);
  });
  it('theo nhóm: chậm tiến độ', () => {
    const r = A('Điền Note "Cần họp" cho các dự án chậm tiến độ');
    expect(r.stagedItems.length).toBeGreaterThan(0);
    expect(r.stagedItems.length).toBeLessThan(rows.length);
  });
  it('nhiều mã trong một lệnh', () => {
    const r = A('Đổi Note của ' + rows[0].ma + ', ' + rows[1].ma + ' thành "Họp lại"');
    expect(r.stagedItems.map((x) => x.i).sort()).toEqual([rows[0].i, rows[1].i].sort());
  });
  it('Đánh dấu … là rủi ro cao', () => {
    const r = A('Đánh dấu ' + rows[0].ma + ', ' + rows[1].ma + ' là rủi ro cao');
    expect(r.stagedItems.length).toBeGreaterThan(0);
    expect(r.stagedItems.every((x) => x.to === 'Cao')).toBe(true);
  });
  it('giá trị ngoài danh mục bị từ chối, không đưa vào bản xem trước', () => {
    expect(A('Đổi Mức độ rủi ro của ' + rows[0].ma + ' thành abc').stagedItems).toHaveLength(0);
  });
  it('"Nhờ AI soạn" trả nút chạy soạn nháp', () => {
    expect(A('Nhờ AI soạn các ô trống').act[0].act).toBe('ai');
  });
  it('Xóa ô đang trống thì báo trống sẵn', () => {
    expect(A('Xóa Note của ' + rows[0].ma).html).toContain('trống sẵn');
  });
});

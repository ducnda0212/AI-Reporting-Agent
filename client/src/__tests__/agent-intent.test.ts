/* V-LLM đọc ý định → giao diện chạy đúng chức năng có sẵn bằng lệnh chuẩn (không cần người dùng gõ đúng từ khóa). */
import { describe, expect, it } from 'vitest';
import { askAnswer } from '@/lib/ai';
import { intentCommand } from '@/lib/agentRemote';
import { PHASE_BUCKET, baseRows } from './fixtures';

const rows = baseRows();
const ctx = { phaseBucket: PHASE_BUCKET, rows, allRows: rows, sel: null };
const run = (c: string | string[] | null) => (Array.isArray(c) ? c : [c as string]).map((x) => askAnswer(x, ctx));
const colName = 'Note';

describe('intentCommand', () => {
  it('ẩn / hiện cột', () => {
    const h = run(intentCommand({ intent: 'view', view: { action: 'hide', column: colName } }))[0];
    expect(h.hide?.on).toBe(true);
    const s = run(intentCommand({ intent: 'view', view: { action: 'show', column: colName } }))[0];
    expect(s.hide?.on).toBe(false);
  });
  it('chỉ xem dòng cần sửa / bỏ lọc', () => {
    expect(run(intentCommand({ intent: 'view', view: { action: 'only_fix' } }))[0].onlyFix).toBe(true);
    expect(run(intentCommand({ intent: 'view', view: { action: 'show_all' } }))[0].onlyFix).toBe(false);
  });
  it('soạn nháp: ra nút chạy AI', () => {
    const r = run(intentCommand({ intent: 'draft' }))[0];
    expect(JSON.stringify(r.act)).toContain('ai');
  });
  it('duyệt nháp: một mã, nhiều mã, hoặc tất cả', () => {
    expect(intentCommand({ intent: 'approve', target: [rows[0].ma] })).toEqual(['Duyệt nháp của ' + rows[0].ma]);
    expect(intentCommand({ intent: 'approve', target: [] })).toBe('Duyệt tất cả nháp AI');
    expect(run(intentCommand({ intent: 'approve', target: [] }))[0].html).not.toContain('Mình chưa hiểu');
  });
  it('thiếu thông tin hoặc ý định khác thì không chạy gì', () => {
    expect(intentCommand({ intent: 'view', view: { action: 'hide', column: '' } })).toBeNull();
    expect(intentCommand({ intent: 'view', view: {} })).toBeNull();
    expect(intentCommand({ intent: 'filter' })).toBeNull();
  });
});

/* Nối nút "Nhờ AI soạn các ô trống" với /api/ai/draft: dựng yêu cầu gửi backend và trộn kết quả vào nháp theo luật. */
import { describe, expect, it } from 'vitest';
import type { AiDraftCell } from '@/lib/ai';
import type { DraftOut } from '@/lib/api';
import { draftRequestRow, mergeRemote, reportWeek } from '@/lib/draftRemote';
import type { Row } from '@/types';

const row = {
  i: 3, ma: 'I.A.4.1', viec: 'Tối ưu ghép đơn', pic: 'Nguyễn Văn An', po: 'Trần Thị Bình', tl: 'Nguyễn Văn An', comment: 'Risk: trễ dữ liệu',
  pr: [{ date: '2026-11-05', done: 'a', plan: 'b' }, { date: '2026-11-12', done: 'c', plan: 'd' }],
  prw: { w3: { date: '2026-11-19', done: 'Blockers:\nchờ GPU', plan: 'chạy UAT' } },
  subtasks: [{ key: 'K-1', summary: 's', status: 'To Do', assignee: 'Lê Quang Huy' }],
} as unknown as Row;
const show = (id: string): string => ({ tt: 'In Progress', td: 'Chậm tiến độ', end: '30/11/2026' } as Record<string, string>)[id] || '';

const cell = (i: number, f: 'rui' | 'kh' | 'vd', text: string): AiDraftCell => ({ i, f, d: { text, why: 'luật', src: 'nguồn', ok: true } });
const out = (text: string, sug: boolean): DraftOut => ({
  issues: { text: 'Vướng: chờ GPU.', from: 'Progress Report', why: 'có blocker', need: sug ? 'action' : 'none', notes: [],
    suggestion: sug ? { kind: 'action', text: 'Đề xuất chốt mốc', merged: text, why: 'AI đọc blocker', by: 'm', count: 1, categories: [] } : null },
  riskLevel: { text: 'Cao', why: 'blocker kéo dài', by: 'm' },
});

describe('yêu cầu gửi backend', () => {
  it('tuần đang làm là 7 ngày tính đến ngày báo cáo', () => {
    expect(reportWeek(new Date(2026, 10, 22))).toEqual({ key: 'w3', start: '2026-11-15', end: '2026-11-22' });
  });
  it('dựng đủ trường, tên người gửi riêng và không trùng', () => {
    const q = draftRequestRow(row, show, true, new Date(2026, 10, 22));
    expect(q.id).toBe(3); expect(q.code).toBe('I.A.4.1'); expect(q.late).toBe(true); expect(q.progress).toBe('Chậm tiến độ'); expect(q.end).toBe('30/11/2026');
    expect(q.weekReport).toEqual({ date: '2026-11-19', done: 'Blockers:\nchờ GPU', plan: 'chạy UAT' });
    expect(q.lastReport).toEqual({ date: '2026-11-12', done: 'c', plan: 'd' });
    expect(q.people).toEqual(['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Quang Huy']);
    expect(q.comment).toBe('Risk: trễ dữ liệu');
  });
  it('dòng chưa có report tuần này gửi weekReport = null', () => {
    const q = draftRequestRow({ ...row, prw: {}, pr: [] } as unknown as Row, show, false);
    expect(q.weekReport).toBeNull(); expect(q.lastReport).toBeNull();
  });
});

describe('trộn nháp AI vào nháp theo luật', () => {
  const local = [cell(3, 'rui', 'Trung bình'), cell(3, 'kh', 'chạy UAT'), cell(3, 'vd', 'Vướng: chờ GPU.'), cell(4, 'rui', 'Thấp')];
  it('AC và AT lấy từ AI, AS giữ theo luật, mọi ô chờ duyệt', () => {
    const m = mergeRemote(local, { drafts: { '3': out('Vướng: chờ GPU.\n→ Đề xuất chốt mốc', true) }, errors: {}, model: 'm' });
    expect(m.cells[0].d.text).toBe('Cao'); expect(m.cells[0].d.why).toBe('blocker kéo dài');
    expect(m.cells[1].d.text).toBe('chạy UAT');
    expect(m.cells[2].d.text).toBe('Vướng: chờ GPU.\n→ Đề xuất chốt mốc'); expect(m.cells[2].d.why).toBe('AI đọc blocker');
    expect(m.cells.slice(0, 3).map((x) => x.d.ok)).toEqual([false, true, false]);
    expect(m.fromAi).toBe(2); expect(m.byRule).toBe(2);
  });
  it('dòng backend lỗi hoặc không trả về giữ nháp theo luật', () => {
    const m = mergeRemote(local, { drafts: {}, errors: { '3': 'lỗi', '4': 'lỗi' }, model: 'm' });
    expect(m.cells.map((x) => x.d.text)).toEqual(['Trung bình', 'chạy UAT', 'Vướng: chờ GPU.', 'Thấp']);
    expect(m.fromAi).toBe(0);
  });
  it('mức rủi ro lạ hoặc nội dung rỗng thì bỏ, không ghi đè', () => {
    const bad = out('', false); bad.riskLevel.text = 'Rất cao'; bad.issues.text = '';
    const m = mergeRemote(local, { drafts: { '3': bad }, errors: {}, model: 'm' });
    expect(m.cells[0].d.text).toBe('Trung bình'); expect(m.cells[2].d.text).toBe('Vướng: chờ GPU.');
  });
  it('dòng không cần gợi ý (need = none) dùng chữ backend bóc từ report', () => {
    const o = out('', false);
    const m = mergeRemote([cell(3, 'vd', 'cũ')], { drafts: { '3': o }, errors: {}, model: 'm' });
    expect(m.cells[0].d.text).toBe('Vướng: chờ GPU.'); expect(m.cells[0].d.why).toBe('có blocker');
  });
});

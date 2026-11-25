import { describe, expect, it } from 'vitest';
import { colNum, colLetter, ck, spillCls, mapNorm, cellValue, refOf, fieldById } from '@/lib/cell';
import { cleanText, cleanKpi, cleanComment, ruleCounts } from '@/lib/clean';
import { selKeys, visibleFields } from '@/lib/grid';
import { parseMilestones, poNm } from '@/lib/popout';
import { vCompare2, cxNote, diffSnap, vhList, type CmpSide } from '@/lib/versions';
import { getStoredTheme, toggleTheme } from '@/lib/theme';
import { STATUS_MAP, SEED_VERSIONS } from '@/data/constants';

const side = (key: string, wk: CmpSide['wk'], snap: CmpSide['snap']): CmpSide => ({ key, wk, snap });

describe('Core Pure Helpers', () => {
  it('chuyển đổi tọa độ cột Excel (đếm từ 1) và mã màu pill chuẩn xác', () => {
    expect(colNum('A')).toBe(1);
    expect(colNum('AA')).toBe(27);
    expect(colLetter({ col: 'AT' })).toBe('AT');
    expect(ck(2, 'td')).toBe('2|td');
    expect(spillCls('Chậm tiến độ')).toBe('e');
    expect(spillCls('Đúng tiến độ')).toBe('o');
    expect(mapNorm(STATUS_MAP, 'in_progress')).toBe('Đang thực hiện');
    expect(mapNorm(STATUS_MAP, 'zzz')).toBeUndefined();
    expect(refOf({ tplRow: 5 }, { col: 'AC' })).toBe('AC5');
    expect(refOf({ tplRow: 0 }, { col: 'AC' })).toBe('AC+');
  });

  it('cellValue quy đổi Status/Progress/Phase và ưu tiên sửa tay', () => {
    const r = { ma: 'I.A.3.1', viec: 'x', rawStatus: 'in progress', rawProgress: 'Off-track', rawPhase: 'p', ovr: {}, ai: {}, reasons: {} } as never;
    const ctx = { phaseBucket: { p: 4 } };
    expect(cellValue(r, fieldById('tt')!, ctx)).toBe('Đang thực hiện');
    expect(cellValue(r, fieldById('td')!, ctx)).toBe('Chậm tiến độ');
    expect(cellValue(r, fieldById('buocso')!, ctx)).toBe('Bước 4');
    expect(cellValue({ ...(r as object), ovr: { td: 'Đúng tiến độ' } } as never, fieldById('td')!, ctx)).toBe('Đúng tiến độ');
  });

  it('làm sạch wiki markup Jira, bảng KPI và tiền tố Comment', () => {
    expect(cleanText('*Tiến độ:*  [PMO-1|https://x.com]')).toContain('Tiến độ:');
    expect(cleanText('*Tiến độ:*  [PMO-1|https://x.com]')).not.toContain('*');
    expect(cleanKpi('||*STT*||*KPI*||\n|1|Đạt 90%|')).toContain('1. Đạt 90%');
    expect(cleanComment('07/Nov/26 5:09 PM;abc123;{{2026-11-10}} Nội dung')).toContain('Nội dung');
    expect(ruleCounts('* a\n* b').bullet).toBe(2);
  });

  it('vùng chọn và cột hiển thị', () => {
    const vf = visibleFields({ x: true }).map((f) => f.id);
    expect(vf).not.toContain('x');
    expect(vf).toContain('ma');
    expect(selKeys({ i: 1, f: 'tt' }, { a: { i: 1, f: 'tt' }, b: { i: 3, f: 'td' } }, [1, 2, 3], ['tt', 'td'])).toEqual(['1|tt', '1|td', '2|tt', '2|td', '3|tt', '3|td']);
    expect(selKeys(null, null, [], [])).toEqual([]);
  });

  it('parse Milestone thành timeline done/next theo mốc 22/11/2026', () => {
    const ms = parseMilestones('14/11: Pilot\n10/12: Go-Live\nGhi chú tự do');
    expect(ms[0]).toEqual({ date: '14/11', text: 'Pilot', status: 'done' });
    expect(ms[1].status).toBe('next');
    expect(ms[2]).toEqual({ date: null, text: 'Ghi chú tự do', status: '' });
    expect(poNm('Đã Hoàn Thành')).toBe('da hoan thanh');
  });

  it('vCompare2 bỏ qua placeholder CX_PH và cxNote nêu dự án xấu đi', () => {
    const snapA = { 'I.A.3.1|tt': 'Đang thực hiện', 'I.A.3.1|td': 'Đúng tiến độ', 'I.A.3.1|vd': 'Không có.', 'I.A.3.1|rui': 'Thấp' };
    const snapB = { 'I.A.3.1|tt': 'Đang thực hiện', 'I.A.3.1|td': 'Chậm tiến độ', 'I.A.3.1|vd': 'Chờ DPO', 'I.A.3.1|rui': 'Cao' };
    const rows = [{ ma: 'I.A.3.1', viec: 'Điều phối', ai: {} }] as never;
    const cmp = vCompare2(side('w2|1', 'w2', snapA), side('w3|1', 'w3', snapB), rows);
    expect(cmp.A.ok).toBe(1);
    expect(cmp.B.late).toBe(1);
    expect(cmp.bad.some((x) => x.k === 'tt')).toBe(true);
    /* 'Không có.' là placeholder → coi như trống nên vấn đề "Chờ DPO" là vấn đề mới */
    expect(cmp.plan[0].iss).toBe('new');
    expect(cxNote(cmp, 'Tuần 02/11 · Bản 1', 'Tuần 3/11 · Bản 1')).toContain('I.A.3.1');
  });

  it('vCompare2 đọc nháp AI chưa duyệt trên bảng đang làm (cur) và đánh dấu draft', () => {
    const snapA = { 'I.A.3.1|tt': 'Đang thực hiện', 'I.A.3.1|td': 'Đúng tiến độ', 'I.A.3.1|vd': 'Không có.' };
    const snapCur = { 'I.A.3.1|tt': 'Đang thực hiện', 'I.A.3.1|td': 'Đúng tiến độ', 'I.A.3.1|vd': null };
    const rows = [{ ma: 'I.A.3.1', viec: 'Điều phối', ai: { vd: { text: 'Chưa có Progress Report tuần này\nChờ DPO', why: '', src: '', ok: false } } }] as never;
    const cmp = vCompare2(side('w2|1', 'w2', snapA), side('cur', 'w3', snapCur), rows);
    expect(cmp.cross).toBe(true);
    expect(cmp.plan[0].vB).toEqual({ v: 'Chờ DPO', draft: true });
    expect(cmp.bad.find((x) => x.k === 'vd')!.what).toContain('(nháp AI)');
    /* bản đã chốt thì không đọc nháp */
    const closed = vCompare2(side('w2|1', 'w2', snapA), side('w3|1', 'w3', snapCur), rows);
    expect(closed.plan[0].vB.draft).toBe(false);
  });

  it('diffSnap và vhList', () => {
    expect(diffSnap({ 'I.A.3.1|tt': 'a' }, { 'I.A.3.1|tt': 'b' })).toEqual([['I.A.3.1', 'I ' + fieldById('tt')!.name, 'a', 'b']]);
    expect(vhList(SEED_VERSIONS).map((x) => x.k)).toEqual(['cur', 'w2|2', 'w2|1', 'w1|1']);
  });

  it('theme không làm hỏng khi chạy ngoài trình duyệt (SSR)', () => {
    expect(getStoredTheme()).toBeNull();
    expect(toggleTheme()).toBe('dark');
  });
});

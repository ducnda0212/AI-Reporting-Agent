import { describe, expect, it } from 'vitest';
import { colNum, colLetter, ck, spillCls, mapNorm, cellValue, refOf, fieldById } from '@/lib/cell';
import { cleanText, cleanKpi, cleanComment, ruleCounts } from '@/lib/clean';
import { findMatches, groupedRows, selKeys, visibleFields } from '@/lib/grid';
import { exXlsx, pvUnzip } from '@/lib/xlsx';
import { FIELDS } from '@/data/constants';
import type { Row } from '@/types';
import { parseMilestones, poNm, poWeeks } from '@/lib/popout';
import { vCompare2, cxNote, diffSnap, vhList, type CmpSide } from '@/lib/versions';
import { getStoredTheme, toggleTheme } from '@/lib/theme';
import { STATUS_MAP } from '@/data/constants';
import { PHASE_BUCKET } from './fixtures';
import { SEED_VERSIONS, setFixtureCycle } from './fixtures';

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

  it('parseMilestones đọc dòng Jira yyyy-mm-dd, hiện dd/mm và so cả năm', () => {
    const ms = parseMilestones('2026-05-01 Khởi động\n2026-11-14 Pilot\n2026-12-10 Go-Live\n2027-01-15 Phase 2', '2026-11-26');
    expect(ms).toEqual([
      { date: '01/05', text: 'Khởi động', status: 'done' },
      { date: '14/11', text: 'Pilot', status: 'done' },
      { date: '10/12', text: 'Go-Live', status: 'next' },
      { date: '15/01', text: 'Phase 2', status: 'next' },
    ]);
    expect(parseMilestones('2026-12-10 Go-Live\n2027-01-15 Phase 2', '2026-12-20').map((m) => m.status)).toEqual(['done', 'next']);
  });

  it('poWeeks and parseMilestones adapt to December cycle weeks and activeToday', () => {
    const decWeeks = [
      { k: 'w1' as const, name: 'Tuần 01/12 · 01–07/12', range: '01–07/12', start: '2026-12-01', end: '2026-12-07' },
      { k: 'w2' as const, name: 'Tuần 02/12 · 08–14/12', range: '08–14/12', start: '2026-12-08', end: '2026-12-14' },
      { k: 'w3' as const, name: 'Tuần 3/12 · 15–21/12', range: '15–21/12', cur: true, start: '2026-12-15', end: '2026-12-21' },
      { k: 'w4' as const, name: 'Tuần 4/12 · 22–31/12', range: '22–31/12', future: true, start: '2026-12-22', end: '2026-12-31' },
    ];
    const wks = poWeeks(false, decWeeks);
    expect(wks[2][1]).toContain('Tuần 3/12');
    expect(wks[2][3]).toEqual(['ht', 'kh', 'vd']);
    expect(poWeeks(false, [])[2][1]).toBe('Tuần 3/11');
    const ms = parseMilestones('10/12: SIT\n25/12: Go-live', '2026-12-18');
    expect(ms[0].status).toBe('done');
    expect(ms[1].status).toBe('next');
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
    setFixtureCycle();
    expect(vhList(SEED_VERSIONS).map((x) => x.k)).toEqual(['cur', 'w2|2', 'w2|1', 'w1|1']);
  });

  it('theme không làm hỏng khi chạy ngoài trình duyệt (SSR)', () => {
    expect(getStoredTheme()).toBeNull();
    expect(toggleTheme()).toBe('dark');
  });
});


describe('groupedRows: dòng có nhóm ngoài s.groups không bị rơi', () => {
  const mk = (i: number, g: string, ma: string) => ({ i, g, ma, mang: g, viec: 'Việc ' + ma, ai: {}, prw: {}, subtasks: [], reasons: {}, ovr: {}, pr: [] }) as unknown as Row;
  const rows = [mk(0, 'I.A.1', 'I.A.1.1'), mk(1, 'I.1.6', 'I.1.6.5'), mk(2, 'x.x', 'x.x.20')];
  const groups = [{ k: 'I.A.1', name: 'I.A.1.Tên' }];

  it('giữ thứ tự groups rồi nối nhóm lạ ở cuối', () => {
    const out = groupedRows(groups, rows);
    expect(out.map((x) => x.g.k)).toEqual(['I.A.1', 'I.1.6', 'x.x']);
    expect(out[0].g.name).toBe('I.A.1.Tên');
    expect(out.map((x) => x.gr.map((r) => r.ma))).toEqual([['I.A.1.1'], ['I.1.6.5'], ['x.x.20']]);
  });

  it('bỏ nhóm rỗng', () => {
    expect(groupedRows([...groups, { k: 'Z', name: 'Z' }], rows).map((x) => x.g.k)).not.toContain('Z');
  });

  it('findMatches và exXlsx vẫn thấy dòng nhóm lạ', async () => {
    const st = { find: { q: 'I.1.6.5', open: true, scope: 'all', case: false, whole: false, filter: false }, hidden: {}, phaseBucket: PHASE_BUCKET, groups } as never;
    expect(findMatches(st, rows).some((m) => m.i === 1)).toBe(true);
    const blob = exXlsx(rows, FIELDS.slice(0, 5), { phaseBucket: PHASE_BUCKET, sort: null, groups } as never);
    const sheet = (await pvUnzip(await blob.arrayBuffer()).get('xl/worksheets/sheet1.xml'))!;
    expect(sheet).toContain('I.1.6.5');
    expect(sheet).toContain('x.x.20');
  });
});

import { describe, expect, it } from 'vitest';
import { findMatches, needsFix, passColFilters, sortRows } from '@/lib/grid';
import { verEditList } from '@/lib/versions';
import { SEED_VERSIONS } from '@/data/constants';
import type { FindState, Row, VersionItem } from '@/types';

const ctx = { phaseBucket: {} };
const row = (i: number, ma: string, end: string, extra: Partial<Row> = {}): Row => ({
  i, ma, viec: 'Dự án ' + ma, g: 'I.A.3', rawStatus: 'IN PROGRESS', rawProgress: 'On-track', rawPhase: '', end,
  ai: {}, ovr: {}, reasons: {}, stages: [], ...extra
} as Row);
const find = (q: string, o: Partial<FindState> = {}): FindState =>
  ({ open: true, q, cs: false, whole: false, scope: 'all', all: false, filter: false, idx: 0, focus: false, caret: null, ...o });

describe('grid: lọc cột, tìm kiếm, sắp xếp, dòng cần sửa', () => {
  const rows = [row(0, 'I.A.3.1', '10/12/2026'), row(1, 'I.A.3.2', '01/12/2026', { rawProgress: 'Off-track' })];

  it('passColFilters giữ dòng có giá trị được chọn, cột không tồn tại bị bỏ qua', () => {
    expect(passColFilters(rows[1], { td: { 'Chậm tiến độ': 1 } }, ctx)).toBe(true);
    expect(passColFilters(rows[0], { td: { 'Chậm tiến độ': 1 } }, ctx)).toBe(false);
    expect(passColFilters(rows[0], { note: { '(Trống)': 1 } }, ctx)).toBe(true);
    expect(passColFilters(rows[0], { zz: {} } as never, ctx)).toBe(true);
  });

  it('findMatches theo thứ tự dòng → cột, bỏ cột ẩn, khớp cả ô / hoa thường', () => {
    const st = { find: find('chậm tiến độ', { whole: true }), hidden: {}, phaseBucket: {} };
    expect(findMatches({ ...st, find: find('chậm') }, rows).map((m) => m.f)).toEqual(['td', 'tt1']);
    expect(findMatches(st, rows)).toEqual([{ i: 1, f: 'td', t: 'Chậm tiến độ' }]);
    expect(findMatches({ ...st, hidden: { td: true } }, rows)).toEqual([]);
    expect(findMatches({ ...st, find: find('I.A.3', { whole: true }) }, rows)).toEqual([]);
    expect(findMatches({ ...st, find: find('i.a.3.2') }, rows).map((m) => m.i + m.f)).toEqual(['1ma', '1viec']);
    expect(findMatches({ ...st, find: find('  ') }, rows)).toEqual([]);
  });

  it('sortRows theo ngày dd/mm/yyyy, ô trống xuống cuối; needsFix khi có nháp chờ duyệt', () => {
    const list = [...rows, row(2, 'I.A.3.3', '')];
    expect(sortRows(list, { f: 'end', dir: 'asc' }, ctx).map((r) => r.i)).toEqual([1, 0, 2]);
    expect(sortRows(list, { f: 'end', dir: 'desc' }, ctx).map((r) => r.i)).toEqual([0, 1, 2]);
    expect(sortRows(list, null, ctx)).toBe(list);
    const pend = row(3, 'I.A.3.4', '', { ai: { rui: { text: 'Cao', why: '', src: '', ok: false } } });
    expect(needsFix(pend, ctx)).toBe(true);
  });
});

describe('versions: verEditList không đổi dữ liệu bản', () => {
  it('đọc `edits` (ghép ngày + giờ) mà không mutate phiên bản', () => {
    const v: VersionItem = { ...SEED_VERSIONS[0], edits: [{ t: '09:15', day: '18/11/2026', a: 'Sửa ô', o: 'I.A.3.1', d: 'a → b' }] };
    const before = structuredClone(v);
    expect(verEditList(v, [])).toEqual([{ when: '18/11 09:15', who: v.by, what: 'Sửa ô', obj: 'I.A.3.1', d: 'a → b' }]);
    expect(v).toEqual(before);
    const seed = structuredClone(SEED_VERSIONS);
    SEED_VERSIONS.forEach((x) => verEditList(x, []));
    expect(SEED_VERSIONS).toEqual(seed);
  });
});

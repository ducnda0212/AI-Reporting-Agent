import { describe, it, expect, beforeEach } from 'vitest';
import { getState, mutate, resetStore } from '@/store';
import { setCycle, WK_TXT } from '@/data/constants';
import { activeWkOf, cellValue, displayText, effectiveKind, fieldById, grpName, locked, wkShort } from '@/lib/cell';
import { editCell, tvLaterGrps, tvSetWeeks } from '@/store/actions/grid';

const wk = (k: string, cur: boolean, future: boolean, name: string, range: string, start: string, end: string) => ({ k, name, range, cur, future, start, end });
const NOV_W4 = [
  wk('w1', false, false, 'Tuần 01/11 · 31/10–06/11', '31/10–06/11', '2026-10-31', '2026-11-06'),
  wk('w2', false, false, 'Tuần 02/11 · 07–14/11', '07–14/11', '2026-11-07', '2026-11-14'),
  wk('w3', false, false, 'Tuần 03/11 · 15–22/11', '15–22/11', '2026-11-15', '2026-11-22'),
  wk('w4', true, false, 'Tuần 04/11 · 23–30/11', '23–30/11', '2026-11-23', '2026-11-30')
];
const DEC_W1 = [
  wk('w1', true, false, 'Tuần 01/12 · 01–06/12', '01–06/12', '2026-12-01', '2026-12-06'),
  wk('w2', false, true, 'Tuần 02/12 · 07–14/12', '07–14/12', '2026-12-07', '2026-12-14'),
  wk('w3', false, true, 'Tuần 03/12 · 15–22/12', '15–22/12', '2026-12-15', '2026-12-22'),
  wk('w4', false, true, 'Tuần 04/12 · 23–30/12', '23–30/12', '2026-12-23', '2026-12-30')
];

describe('Giai đoạn 3 phương án 1A: tuần động w1..w4', () => {
  beforeEach(() => resetStore());

  it('mở khoá w4 và khoá w3 thành "đã qua" khi kỳ là 2026_11_w4', () => {
    setCycle('2026-11-26', NOV_W4);
    mutate((d) => {
      d.loaded = true; d.weeks = NOV_W4;
      d.allRows = [{ i: 0, ma: 'I.C.1.2', ovr: {}, ai: {}, reasons: {}, stages: [], w4ht: 'Done W4', ht: 'Done W3' } as never];
    });
    const s = getState(), fW4 = fieldById('w4ht')!, fW3 = fieldById('ht')!;
    expect(WK_TXT.w4).toEqual(['w4ht', 'w4kh', 'w4vd']);
    expect(activeWkOf(s)).toBe('w4');
    expect(effectiveKind(fW4, s)).toBe('report');
    expect(effectiveKind(fW3, s)).toBe('past');
    expect(effectiveKind(fieldById('kh')!, s)).toBe('past');
    expect(locked(fW4, s)).toBe(false);
    expect(locked(fW3, s)).toBe(true);
    expect(cellValue(s.allRows[0], fW4, s)).toBe('Done W4');
    expect(displayText(s.allRows[0], fW4, s)).toBe('Done W4');
    mutate((d) => { expect(editCell(d, 0, 'w4ht', 'Updated W4')).toBe(true); });
    expect(getState().allRows[0].ovr.w4ht).toBe('Updated W4');
    mutate((d) => { expect(editCell(d, 0, 'ht', 'x')).toBe(false); });
  });

  it('mở khoá w1 và w2..w4 thành "tương lai" khi kỳ là 2026_12_w1', () => {
    setCycle('2026-12-02', DEC_W1);
    const s = { weeks: DEC_W1 };
    expect(activeWkOf(s)).toBe('w1');
    expect(locked(fieldById('w1ht')!, s)).toBe(false);
    expect(effectiveKind(fieldById('w2ht')!, s)).toBe('future');
    expect(effectiveKind(fieldById('w4vd')!, s)).toBe('future');
    expect(locked(fieldById('w2ht')!, s)).toBe(true);
    expect(displayText({ w2ht: 'x', ovr: {}, ai: {}, reasons: {} } as never, fieldById('w2ht')!, s as never)).toBe('');
  });

  it('không có tuần nào thì giữ hành vi cũ theo f.kind (w3 là tuần làm việc)', () => {
    setCycle('2026-11-22', []);
    expect(activeWkOf()).toBe('w3');
    expect(effectiveKind(fieldById('w4ht')!)).toBe('future');
    expect(locked(fieldById('w1ht')!)).toBe(true);
    expect(locked(fieldById('ht')!)).toBe(false);
  });

  it('nhãn tuần và Cấu hình mẫu theo kỳ: tvSetWeeks ẩn các tuần trước tuần đang làm', () => {
    setCycle('2026-11-26', NOV_W4);
    mutate((d) => { d.weeks = NOV_W4; d.cycleId = '2026_11_w4'; });
    expect([wkShort('w1', '2026_12_w1'), wkShort('w3', '2026_11_w3'), wkShort('w4', '2026_11_w4')]).toEqual(['T01/12', 'T3/11', 'T4/11']);
    expect(grpName('w4', getState())).toBe('Tuần 04/11');
    expect(tvLaterGrps(getState())).toEqual([]);
    tvSetWeeks(2);
    const h = getState().hidden;
    expect([h.w1ht, h.w2ht, h.ht, h.w4ht]).toEqual([true, true, undefined, undefined]);
    tvSetWeeks(3);
    expect(getState().hidden.w2ht).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { getState, resetStore } from '@/store';
import { setCycle } from '@/data/constants';
import { exTT } from '@/lib/ai';
import type { Row } from '@/types';

/* Cột Tiến độ gửi cho Trợ lý và hiện ở màn Trợ lý (exTT). Ngày báo cáo 25/11/2026. */
const row = (tt: string, td: string, end: string, rui = ''): Row =>
  ({ i: 0, ma: 'I.A.1.1', ovr: { tt, td }, ai: rui ? { rui: { text: rui, ok: true } } : {}, reasons: {}, stages: [], end } as never);

describe('exTT: tiến độ theo ngày báo cáo', () => {
  beforeEach(() => {
    resetStore();
    setCycle('2026-11-25', [{ k: 'w4', name: 'Tuần 04/11', cur: true, future: false }]);
  });

  it('dự án đã hoàn thành có hạn trước ngày báo cáo KHÔNG bị tính chậm', () => {
    expect(exTT(row('Đã hoàn thành', 'Đúng tiến độ', '15/11/2026'), getState())).toBe('Đúng tiến độ');
    expect(exTT(row('Hủy', '', '01/11/2026'), getState())).toBe('Đúng tiến độ');
  });

  it('dự án chưa xong mà quá hạn vẫn là chậm tiến độ', () => {
    expect(exTT(row('Đang thực hiện', 'Đúng tiến độ', '20/11/2026'), getState())).toBe('Chậm tiến độ');
  });

  it('Jira ghi Có rủi ro là có nguy cơ chậm, dù hạn còn xa', () => {
    expect(exTT(row('Đang thực hiện', 'Có rủi ro', '31/12/2026'), getState())).toBe('Có nguy cơ chậm');
  });

  it('còn ≤ 14 ngày tới hạn: chưa xong là có nguy cơ chậm, đã xong thì không', () => {
    expect(exTT(row('Đang thực hiện', 'Đúng tiến độ', '05/12/2026'), getState())).toBe('Có nguy cơ chậm');
    expect(exTT(row('Đã hoàn thành', 'Đúng tiến độ', '05/12/2026'), getState())).toBe('Đúng tiến độ');
  });

  it('Tiến độ (J) = Chậm tiến độ luôn là chậm, kể cả đã hoàn thành', () => {
    expect(exTT(row('Đã hoàn thành', 'Chậm tiến độ', '15/11/2026'), getState())).toBe('Chậm tiến độ');
  });
});

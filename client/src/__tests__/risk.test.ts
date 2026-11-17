import { describe, expect, it } from 'vitest';
import { RISK_CASES } from '@/data/risk';
import { level, riskList, riskPending, riskScore } from '@/lib/risk';
import { getState } from '@/store';
import { riskApprove, riskEditSave, riskUndo } from '@/store/actions/risk';
import { loadFile } from '@/store/actions/flow';

const byId = (id: string) => RISK_CASES.find((c) => c.id === id)!;

describe('lib/risk', () => {
  it('level quy giá trị sang mức 1–4 theo ngưỡng', () => {
    expect([20, 15, 14, 5, 4, 1, 0].map((v) => level(v, [15, 5, 1]))).toEqual([4, 4, 3, 3, 2, 2, 1]);
  });
  it('RI-01: trễ UAT + R03 thì đỏ dù chỉ P2', () => {
    const sc = riskScore(byId('RI-01'));
    expect([sc.impact, sc.urgency, sc.score, sc.priority, sc.color]).toEqual([3, 3, 9, 'P2', 'Đỏ']);
  });
  it('RI-03: thiếu người phụ trách cộng 1 Urgency', () => {
    const sc = riskScore(byId('RI-03'));
    expect(sc.adjustments).toEqual([['+1', 'thiếu hạn/PIC']]);
    expect([sc.urgency, sc.score, sc.priority]).toEqual([3, 6, 'P3']);
  });
  it('RI-08: Risk xác suất thấp trừ 1 Urgency nhưng không xuống dưới 1', () => {
    const sc = riskScore(byId('RI-08'));
    expect([sc.urgency, sc.priority, sc.color]).toEqual([1, 'P4', 'Xanh']);
  });
  it('loại C10 ở P3/P4 là "Lưu ý dữ liệu"; đổi loại thì mất cờ này', () => {
    expect(riskScore(byId('RI-07')).color).toBe('Lưu ý dữ liệu');
    expect(riskScore(byId('RI-07'), 'C3').color).toBe('Vàng');
  });
});

describe('store/actions/risk', () => {
  it('đồng ý, sửa (bắt buộc lý do) và hoàn tác', () => {
    loadFile('x.csv', true);
    const total = RISK_CASES.length;
    expect(riskPending(getState())).toBe(total);
    riskApprove('RI-01');
    expect(riskPending(getState())).toBe(total - 1);
    expect(riskEditSave('RI-02', 'P1', 'C5', '  ')).toBe(false);
    expect(getState().rid.decisions['RI-02']).toBeUndefined();
    expect(riskEditSave('RI-02', 'P1', 'C5', 'khách hàng chiến lược')).toBe(true);
    const item = riskList(getState()).find((x) => x.c.id === 'RI-02')!;
    expect([item.priority, item.color, item.decision?.kind]).toEqual(['P1', 'Đỏ', 'edit']);
    riskUndo('RI-02');
    expect(getState().rid.decisions['RI-02']).toBeUndefined();
  });
});

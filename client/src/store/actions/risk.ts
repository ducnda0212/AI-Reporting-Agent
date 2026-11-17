import type { RiskFilter, RiskPriority } from '@/types';
import { riskList, riskScore } from '@/lib/risk';
import { RISK_CASES, RISK_CRITERIA } from '@/data/risk';
import { nowStr } from '@/lib/text';
import type { AppState } from '../types';
import { mutate } from '../index';
import { pushLog, setToast } from '../helpers';

/** Sau khi duyệt một ca, chuyển sang ca chưa duyệt đầu tiên. */
function selectNextPending(d: AppState) {
  const next = riskList(d).find((x) => !x.decision);
  if (next) d.rid.sel = next.c.id;
}

export const riskSelect = (id: string) => mutate((d) => { d.rid.sel = id; d.rid.edit = null; });
export const riskFilter = (flt: RiskFilter) => mutate((d) => { d.rid.flt = flt; d.rid.edit = null; });
export const riskRerun = () => mutate((d) => { setToast(d, `Đã chấm lại ${RISK_CASES.length} vấn đề theo Bộ tiêu chí ${RISK_CRITERIA.version}`); });

export const riskApprove = (id: string) => mutate((d) => {
  d.rid.decisions[id] = { kind: 'ok', at: nowStr() };
  pushLog(d, 'Đồng ý đánh giá AI', id, '');
  setToast(d, 'Đã đồng ý ' + id);
  selectNextPending(d);
});

export const riskDrop = (id: string) => mutate((d) => {
  d.rid.decisions[id] = { kind: 'drop', at: nowStr() };
  pushLog(d, 'Bỏ đánh giá AI', id, '');
  setToast(d, 'Đã bỏ ' + id);
  selectNextPending(d);
});

export const riskEditStart = (id: string) => mutate((d) => { d.rid.edit = id; });
export const riskEditCancel = () => mutate((d) => { d.rid.edit = null; });

/** Lưu bản sửa. Bắt buộc có lý do để AI học cho lần sau; trả về false nếu thiếu lý do. */
export function riskEditSave(id: string, priority: RiskPriority, category: string, reason: string): boolean {
  if (!reason.trim()) { mutate((d) => { setToast(d, 'Ghi lý do sửa để AI học cho lần sau'); }); return false; }
  mutate((d) => {
    const c = RISK_CASES.find((x) => x.id === id);
    if (!c) return;
    const from = riskScore(c).priority;
    d.rid.decisions[id] = { kind: 'edit', at: nowStr(), priority, category, from, reason: reason.trim() };
    d.rid.edit = null;
    pushLog(d, 'Sửa đánh giá AI', id, `${from} → ${priority}`);
    setToast(d, 'Đã lưu. Ca này thành ví dụ cho lần chấm sau');
    selectNextPending(d);
  });
  return true;
}

export const riskUndo = (id: string) => mutate((d) => { delete d.rid.decisions[id]; d.rid.sel = id; });

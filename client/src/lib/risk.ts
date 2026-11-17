import type { RiskCase, RiskColor, RiskDecision, RiskPriority, Row } from '@/types';
import { RISK_CASES, RISK_CRITERIA as C } from '@/data/risk';
import type { AppState } from '@/store/types';
import { selectRows } from './cell';

/** Chấm điểm rủi ro: hệ thống tính theo tham số, AI chỉ trích số và chấm định tính. */

/** Quy giá trị đo được sang mức 1–4 theo 3 ngưỡng giảm dần. */
export const level = (v: number, t: [number, number, number]): number => (v >= t[0] ? 4 : v >= t[1] ? 3 : v >= t[2] ? 2 : 1);

export interface RiskAspect { name: string; level: number; note: string; by: 'AI trích' | 'AI chấm' }
export interface RiskScore {
  aspects: RiskAspect[]; impact: number; baseUrgency: number; daysToDue: number; blocked: boolean;
  adjustments: Array<['+1' | '−1', string]>; urgency: number; score: number; priority: RiskPriority; color: RiskColor; colorReason: string;
}

export function riskScore(o: RiskCase, categoryOverride?: string): RiskScore {
  const x = o.impact;
  const aspects: RiskAspect[] = [
    { name: 'Tiến độ', level: level(x.delayDays, C.delayDays), note: x.delayDays ? `trễ ${x.delayDays} ngày` : 'không trễ', by: 'AI trích' },
    { name: 'Tài chính', level: level(x.financePct, C.financePct), note: x.financePct ? `effort +${x.financePct}%` : 'không lệch', by: 'AI trích' },
    { name: 'HĐ & nghiệm thu', level: Math.max(1, x.contract), note: x.contract ? `AI chấm ${x.contract}` : '—', by: 'AI chấm' },
    { name: 'Chất lượng', level: Math.max(1, x.quality), note: x.quality ? `AI chấm ${x.quality}` : '—', by: 'AI chấm' },
    { name: 'Kiểm soát/dữ liệu', level: Math.max(1, x.dataControl), note: x.dataControl ? `AI chấm ${x.dataControl}` : '—', by: 'AI chấm' },
  ];
  const impact = Math.max(...aspects.map((a) => a.level));
  const baseUrgency = o.blocked || o.daysToDue < 0 ? 4 : o.daysToDue <= C.urgentDays ? 3 : o.daysToDue <= C.soonDays ? 2 : 1;
  const adjustments: RiskScore['adjustments'] = [];
  if (o.weeksOpen >= C.staleWeeks) adjustments.push(['+1', `tồn ${o.weeksOpen} tuần`]);
  if (o.noOwner) adjustments.push(['+1', 'thiếu hạn/PIC']);
  if (o.kind === 'Risk' && o.probability === 'Thấp') adjustments.push(['−1', 'Risk xác suất thấp']);
  const urgency = Math.min(4, Math.max(1, baseUrgency + adjustments.reduce((sum, a) => sum + (a[0] === '+1' ? 1 : -1), 0)));
  const score = impact * urgency;
  const priority: RiskPriority = score >= C.priority[0] ? 'P1' : score >= C.priority[1] ? 'P2' : score >= C.priority[2] ? 'P3' : 'P4';
  const hasOverdueSignal = o.signals.some((s) => s[0] === 'R03');
  const category = categoryOverride || o.category;
  let color: RiskColor = priority === 'P1' || (hasOverdueSignal && impact >= 3) ? 'Đỏ' : priority === 'P4' ? 'Xanh' : 'Vàng';
  if (category === 'C10' && (priority === 'P3' || priority === 'P4')) color = 'Lưu ý dữ liệu';
  const colorReason = priority === 'P1' ? 'P1' : color === 'Đỏ' ? 'có R03 và Impact ≥3' : color === 'Lưu ý dữ liệu' ? `loại C10 ở ${priority}` : priority;
  return { aspects, impact, baseUrgency, daysToDue: o.daysToDue, blocked: o.blocked, adjustments, urgency, score, priority, color, colorReason };
}

/** Lớp CSS theo màu: e (đỏ) / w (vàng) / o (xanh) / d (lưu ý dữ liệu). */
export const COLOR_CLASS: Record<RiskColor, 'e' | 'w' | 'o' | 'd'> = { 'Đỏ': 'e', 'Vàng': 'w', 'Xanh': 'o', 'Lưu ý dữ liệu': 'd' };
const COLOR_OF_PRIORITY: Record<RiskPriority, RiskColor> = { P1: 'Đỏ', P2: 'Vàng', P3: 'Vàng', P4: 'Xanh' };

export interface RiskItem {
  c: RiskCase; row: Row; score: RiskScore; decision: RiskDecision | undefined; priority: RiskPriority; color: RiskColor;
}

/** Danh sách ca đã chấm, xếp theo mức ưu tiên. Người duyệt sửa mức ưu tiên thì màu theo mức đó. */
export function riskList(s: AppState): RiskItem[] {
  const rows = selectRows(s);
  return RISK_CASES.map((c) => {
    const decision = s.rid.decisions[c.id];
    const score = riskScore(c, decision?.category);
    const edited = decision?.priority;
    return {
      c, row: rows[c.rowIndex] || rows[0], score, decision,
      priority: edited || score.priority, color: edited ? COLOR_OF_PRIORITY[edited] : score.color,
    };
  }).sort((a, b) => (a.priority < b.priority ? -1 : a.priority > b.priority ? 1 : 0));
}

/** Số ca chưa có quyết định của người duyệt (hiện ở huy hiệu thanh trái). */
export const riskPending = (s: AppState): number => RISK_CASES.filter((c) => !s.rid.decisions[c.id]).length;

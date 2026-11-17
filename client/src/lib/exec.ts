import type { Row } from '@/types';
import type { AppState, ExDraft, ExRow } from '@/store/types';
import { TODAY } from '@/data/constants';
import { cellValue, fieldOf, selectRows } from './cell';
import { parseVN } from './text';

/** Báo cáo điều hành (bản cô đọng cho cấp trên): phân loại tình trạng + soạn nháp. Hàm thuần theo `AppState`. */

export const EX_STATUSES = ['Chậm tiến độ', 'Có nguy cơ chậm', 'Đúng tiến độ'] as const;
export type ExStatus = (typeof EX_STATUSES)[number];

export const exOf = (s: AppState, r: Row): ExRow => s.ex[r.code] || { hl: true };
export const exPct = (r: Row) => Math.round((r.done / r.total) * 100);
export const aiText = (r: Row, k: string) => (r.ai[k] ? r.ai[k]!.text : '');
const V = (s: AppState, r: Row, id: string) => cellValue(s, r, fieldOf(s, id));

export function exRunning(s: AppState): Row[] {
  const seen: Record<string, number> = {};
  return selectRows(s).filter((r) => {
    if (seen[r.code] || V(s, r, 'status') !== 'Đang thực hiện') return false;
    seen[r.code] = 1;
    return true;
  });
}

/** Có nguy cơ chậm: còn ≤ 14 ngày tới hạn mà chưa xong, hoặc Mức độ rủi ro (AC) = Cao */
export function exStatus(s: AppState, r: Row): ExStatus {
  const due = parseVN(V(s, r, 'end'));
  if (V(s, r, 'progress') === 'Chậm tiến độ' || (due && due < TODAY)) return 'Chậm tiến độ';
  if ((due && (due.getTime() - TODAY.getTime()) / 864e5 <= 14) || aiText(r, 'riskLevel') === 'Cao') return 'Có nguy cơ chậm';
  return 'Đúng tiến độ';
}

export function exWhy(s: AppState, r: Row): string {
  const due = parseVN(V(s, r, 'end'));
  const t = exStatus(s, r);
  if (t === 'Chậm tiến độ') return due && due < TODAY ? 'đã quá hạn ' + V(s, r, 'end') : 'Tiến độ (J) = Chậm tiến độ';
  if (t === 'Có nguy cơ chậm') return aiText(r, 'riskLevel') === 'Cao' ? 'Mức độ rủi ro (AC) = Cao' : 'còn ≤ 14 ngày tới hạn ' + V(s, r, 'end');
  return '';
}

export function exSorted(s: AppState, list: Row[]): Row[] {
  return list.slice().sort((a, b) => {
    const d = EX_STATUSES.indexOf(exStatus(s, a)) - EX_STATUSES.indexOf(exStatus(s, b));
    if (d) return d;
    const x = parseVN(V(s, a, 'end'));
    const y = parseVN(V(s, b, 'end'));
    return (x ? x.getTime() : 9e15) - (y ? y.getTime() : 9e15);
  });
}

export const hasIssues = (r: Row): string => {
  const v = aiText(r, 'w3Issues');
  return v && !/^không có\.?$/i.test(v.trim()) ? v : '';
};

export function exPending(s: AppState): number {
  let n = s.exNote && !s.exNote.ok ? 1 : 0;
  exRunning(s).forEach((r) => { const e = exOf(s, r); (['kpiResult', 'directive'] as const).forEach((k) => { const d = e[k]; if (d && !d.ok) n++; }); });
  return n;
}

export const exMissingKpiResult = (s: AppState): number =>
  exRunning(s).filter((r) => { const e = exOf(s, r); return e.hl && V(s, r, 'kpi') && !(e.kpiResult && e.kpiResult.text); }).length;

/** Soạn nháp KPI / ý kiến chỉ đạo / nhận xét chung. Trả về số ô soạn, ghi vào `s.ex`, `s.exNote` (dùng trong recipe immer). */
export function exAiDraft(s: AppState): { nk: number; nc: number } {
  const run = exRunning(s);
  let nk = 0;
  let nc = 0;
  run.forEach((r) => {
    const e: ExRow = (s.ex[r.code] = s.ex[r.code] || { hl: true });
    const kpi = V(s, r, 'kpi');
    const ht = V(s, r, 'w3Done') || '';
    const first = ht.replace(/^\s*[^:\n•]{0,24}:\s*/, '').split(/\n|•/).map((x) => x.trim().replace(/^[-–]\s*/, '')).filter((x) => x.length > 3)[0] || '';
    if (kpi && !e.kpiResult) {
      e.kpiResult = { text: first ? `Tuần này: ${first} — chưa có số đo KPI, cần PIC bổ sung` : 'Chưa có số đo KPI tuần này', ok: false, why: 'Progress Report tuần này + KPI mục tiêu' }; nk++;
    }
    const t = exStatus(s, r);
    const vd = hasIssues(r);
    if (!e.directive && (t === 'Chậm tiến độ' || aiText(r, 'riskLevel') === 'Cao') && vd) {
      e.directive = { text: 'Đề nghị BGĐ chỉ đạo xử lý: ' + vd.split(/[.;\n]/)[0].trim(), ok: false, why: `Vấn đề & đề xuất (AT) · ${exWhy(s, r)}` }; nc++;
    }
  });
  const c: Record<string, number> = { 'Chậm tiến độ': 0, 'Có nguy cơ chậm': 0, 'Đúng tiến độ': 0 };
  run.forEach((r) => { c[exStatus(s, r)]++; });
  const top = exSorted(s, run).filter((r) => exStatus(s, r) === 'Chậm tiến độ').slice(0, 2).map((r) => r.code);
  if (!s.exNote) {
    const note: ExDraft = {
      text: `${run.length} dự án đang thực hiện, ${c['Đúng tiến độ']} đúng tiến độ (${Math.round((c['Đúng tiến độ'] / Math.max(1, run.length)) * 100)} %). `
        + (c['Chậm tiến độ'] ? `${c['Chậm tiến độ']} dự án chậm${top.length ? ', cần chú ý ' + top.join(', ') : ''}. ` : '')
        + (c['Có nguy cơ chậm'] ? `${c['Có nguy cơ chậm']} dự án có nguy cơ chậm do sắp tới hạn hoặc rủi ro cao.` : ''),
      ok: false, why: 'số liệu mục 1 và 3 · dự án chậm có hạn gần nhất',
    };
    s.exNote = note;
  }
  return { nk, nc };
}

/* ---------- "Hỏi AI": trả lời có cấu trúc, component tự dựng giao diện ---------- */
export type AskResult =
  | { kind: 'row'; r: Row }
  | { kind: 'late'; list: Row[] }
  | { kind: 'due'; list: Row[]; until: string }
  | { kind: 'sum'; total: number; ok: number; risk: number; late: number }
  | { kind: 'empty'; list: Array<{ r: Row; n: number }> }
  | { kind: 'unknown' };

export const ASKQ = ['Dự án nào có nguy cơ trễ?', 'Dự án nào đến hạn trong 14 ngày tới?', 'Tóm tắt tuần này', 'Dự án nào còn nhiều ô trống?'];

export function askAnswer(s: AppState, q: string): AskResult {
  const t = q.toLowerCase();
  const rows = selectRows(s);
  const uniq = (arr: Row[]) => { const seen: Record<string, number> = {}; return arr.filter((r) => { if (seen[r.code]) return false; seen[r.code] = 1; return true; }); };
  if (/đang chọn|dự án này/.test(t) && s.sel) return { kind: 'row', r: s.allRows[s.sel.i] };
  if (/trễ|chậm|nguy cơ|rủi ro/.test(t)) return { kind: 'late', list: uniq(rows.filter((r) => exStatus(s, r) !== 'Đúng tiến độ')) };
  if (/hạn|đến hạn|deadline/.test(t)) {
    const list = uniq(rows.filter((r) => { const d = parseVN(V(s, r, 'end')); return d && d >= TODAY && (d.getTime() - TODAY.getTime()) / 864e5 <= 14; }));
    const d = new Date(TODAY.getTime() + 14 * 864e5);
    return { kind: 'due', list, until: `${d.getDate()}/${d.getMonth() + 1}` };
  }
  if (/tóm tắt|tổng quan|tuần này/.test(t)) {
    const late = uniq(rows.filter((r) => exStatus(s, r) === 'Chậm tiến độ')).length;
    const risk = uniq(rows.filter((r) => exStatus(s, r) === 'Có nguy cơ chậm')).length;
    return { kind: 'sum', total: rows.length, ok: rows.length - late - risk, risk, late };
  }
  if (/trống|thiếu|ô/.test(t)) {
    const list = rows.map((r) => ({ r, n: s.fields.filter((f) => f.required && cellValue(s, r, f) === null).length }))
      .filter((x) => x.n).sort((a, b) => b.n - a.n);
    return { kind: 'empty', list };
  }
  return { kind: 'unknown' };
}

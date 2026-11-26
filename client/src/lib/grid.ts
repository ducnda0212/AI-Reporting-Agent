/* Cột hiển thị, lọc cột, tìm kiếm, vùng chọn, độ rộng cột. Port từ prototype v4; mọi hàm nhận state tường minh. */
import { AI_IDS, FIELDS } from '@/data/constants';
import type { AppState, CellRef, Field, FieldId, FilterMap, FindState, Row, SelectionRange } from '@/types';
import { cellValue, ck, colNum, displayText, fieldById, optsFor, phName, type CellCtx } from './cell';

export const visibleFields = (hidden: AppState['hidden']): Field[] => FIELDS.filter((f) => f.key || !hidden[f.id]);

/** Khoá lọc của một ô: dòng đầu tiên của chữ hiển thị, tối đa 80 ký tự. */
export function filterKey(r: Row, f: Field, ctx: CellCtx): string {
  const t = displayText(r, f, ctx).split('\n')[0].trim();
  return t ? t.slice(0, 80) : '(Trống)';
}

export function passColFilters(r: Row, filters: FilterMap, ctx: CellCtx): boolean {
  return (Object.keys(filters) as FieldId[]).every((id) => {
    const f = fieldById(id);
    return !f || !!filters[id]![filterKey(r, f, ctx)];
  });
}

const fnorm = (s: string, cs: boolean): string => (cs ? s : s.toLowerCase());

export function hitText(hay: string, F: Pick<FindState, 'q' | 'cs' | 'whole'>): boolean {
  const h = fnorm(hay, F.cs);
  const q = fnorm(F.q.trim(), F.cs);
  if (!q) return false;
  return F.whole ? h.trim() === q : h.includes(q);
}

/** Phạm vi tìm: cả bảng / tuần này / cột đang chọn (`selF`; chưa chọn ô thì cả bảng). */
export const scopeHas = (f: Field, F: Pick<FindState, 'scope'>, selF?: FieldId): boolean =>
  F.scope === 'week' ? f.grp === 'w3' : F.scope === 'col' && selF ? f.id === selF : f.kind !== 'future' && f.kind !== 'none';

export const hitCell = (r: Row, f: Field, F: FindState, ctx: CellCtx, selF?: FieldId): boolean =>
  scopeHas(f, F, selF) && hitText(displayText(r, f, ctx), F);

export interface FindMatch { i: number; f: FieldId; t: string }

/** Các ô khớp, theo thứ tự nhóm dự án → dòng → cột đang hiện. */
export function findMatches(state: Pick<AppState, 'find' | 'hidden' | 'phaseBucket' | 'groups'> & { sel?: CellRef | null }, rows: Row[]): FindMatch[] {
  const F = state.find;
  if (!F.q.trim()) return [];
  const out: FindMatch[] = [];
  const vf = visibleFields(state.hidden).filter((f) => scopeHas(f, F, state.sel?.f));
  state.groups.forEach((g) => {
    rows.forEach((r) => {
      if (r.g !== g.k) return;
      vf.forEach((f) => {
        const t = displayText(r, f, state);
        if (t && hitText(t, F)) out.push({ i: r.i, f: f.id, t });
      });
    });
  });
  return out;
}

/** Khoá "dòng|cột" của các ô đang chọn (một ô hoặc cả vùng theo thứ tự dòng `order` và cột `vf`). */
export function selKeys(sel: CellRef | null, range: SelectionRange | null, order: number[], vf: FieldId[]): string[] {
  if (!sel) return [];
  if (!range) return [ck(sel.i, sel.f)];
  const ra = order.indexOf(range.a.i), rb = order.indexOf(range.b.i);
  const ca = vf.indexOf(range.a.f), cb = vf.indexOf(range.b.f);
  if (ra < 0 || rb < 0 || ca < 0 || cb < 0) return [ck(sel.i, sel.f)];
  const out: string[] = [];
  for (let r = Math.min(ra, rb); r <= Math.max(ra, rb); r++)
    for (let c = Math.min(ca, cb); c <= Math.max(ca, cb); c++) out.push(ck(order[r], vf[c]));
  return out;
}

/** Độ rộng cột vừa nội dung (70–480px). `measure` đo chiều rộng chữ, do lớp giao diện cung cấp (canvas). */
export function autofitWidth(f: Field, rows: Row[], ctx: CellCtx, measure: (text: string) => number): number {
  let w = Math.min(160, measure(f.name) + 40);
  rows.forEach((r) => displayText(r, f, ctx).split('\n').forEach((l) => { w = Math.max(w, measure(l) + 30); }));
  return Math.round(Math.max(70, Math.min(480, w)));
}

/** Độ rộng ban đầu đủ đọc hết tên cột và chữ gợi ý "Chọn …" (tối đa 380px). `measure(text, weight, size)` đo chữ (canvas). */
export function headerWidth(f: Field, measure: (text: string, weight: number, size: number) => number): number {
  if (f.kind === 'future' || f.kind === 'none') return f.w;
  let need = measure(f.name, 600, 12.5) + 84;
  if (f.required && optsFor(f)) need = Math.max(need, measure('Chọn ' + phName(f), 500, 12) + 64);
  return f.w < need ? Math.min(need, 380) : f.w;
}

/** Màu nền đầu cột theo file mẫu: AL–AW tuần, Y–AK phân loại, O–X đơn vị, K–M tiến độ. */
export function tplColor(f: Pick<Field, 'col'>): string {
  const n = colNum(f.col);
  return n >= 38 ? 'var(--tW)' : n >= 25 ? 'var(--tY)' : n >= 15 ? 'var(--tO)' : n >= 11 && n <= 13 ? 'var(--tK)' : 'var(--bg)';
}

/** Dòng còn ô bắt buộc trống, giai đoạn thiếu Subtask hoặc nháp AI chờ duyệt. */
export const needsFix = (r: Row, ctx: CellCtx): boolean =>
  FIELDS.some((f) => f.required && cellValue(r, f, ctx) === null)
  || r.stages.includes('miss')
  || AI_IDS.some((k) => r.ai[k] && !r.ai[k]!.ok);

function sortVal(r: Row, f: Field, ctx: CellCtx): string {
  const t = displayText(r, f, ctx).trim(), d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (d) return d[3] + d[2] + d[1];
  if (f.id === 'rui' || f.id === 'giatri') return ({ 'Thấp': '1', 'Trung bình': '2', 'Cao': '3' } as Record<string, string>)[t] || t;
  return t;
}

/** Sắp xếp theo cột (ngày dd/mm/yyyy, mức Thấp/Trung bình/Cao); ô trống luôn xuống cuối. */
export function sortRows(list: Row[], sort: AppState['sort'], ctx: CellCtx): Row[] {
  const f = sort && fieldById(sort.f);
  if (!sort || !f) return list;
  const dir = sort.dir === 'desc' ? -1 : 1;
  return list.slice().sort((a, b) => {
    const x = sortVal(a, f, ctx), y = sortVal(b, f, ctx);
    if (!x && !y) return 0; if (!x) return 1; if (!y) return -1;
    return x.localeCompare(y, 'vi', { numeric: true, sensitivity: 'base' }) * dir;
  });
}

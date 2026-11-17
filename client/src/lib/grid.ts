import type { Field, Row } from '@/types';
import type { AppState, FindState } from '@/store/types';
import { GROUPS } from '@/data/constants';
import { ck, displayText, fieldOf, fkey, selectRows, visibleFields } from './cell';
import { needsFix } from './selectors';
import { vnorm } from './text';

/** Lọc / sắp xếp / tìm / vùng chọn của bảng. Hàm thuần theo `AppState`. */

/* ---------- lọc & sắp xếp ---------- */
export function passColFilters(s: AppState, r: Row): boolean {
  return Object.keys(s.colFilter).every((k) => {
    const f = s.fields.find((x) => x.id === k);
    return !f || !!s.colFilter[k][fkey(s, r, f)];
  });
}

function sortVal(s: AppState, r: Row, f: Field): string {
  const t = displayText(s, r, f).trim();
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (d) return d[3] + d[2] + d[1];
  if (f.id === 'riskLevel' || f.id === 'businessValue') return ({ Thấp: '1', 'Trung bình': '2', Cao: '3' } as Record<string, string>)[t] || t;
  return t;
}

export function sortRows(s: AppState, list: Row[]): Row[] {
  const S = s.sort;
  if (!S) return list;
  const f = s.fields.find((x) => x.id === S.f);
  if (!f) return list;
  return list.slice().sort((a, b) => {
    const x = sortVal(s, a, f);
    const y = sortVal(s, b, f);
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1; /* ô trống luôn xuống cuối */
    return x.localeCompare(y, 'vi', { numeric: true, sensitivity: 'base' }) * S.dir;
  });
}

export const nFilters = (s: AppState) => Object.keys(s.colFilter).length;

/** giá trị khác nhau của một cột, phục vụ bộ lọc kiểu Excel */
export function fltValues(s: AppState, fid: string): { k: string; n: number }[] {
  const f = fieldOf(s, fid);
  const cnt: Record<string, number> = {};
  const order: string[] = [];
  selectRows(s).forEach((r) => {
    const k = fkey(s, r, f);
    if (!(k in cnt)) { cnt[k] = 0; order.push(k); }
    cnt[k]++;
  });
  order.sort((a, b) => (a === '(Trống)' ? 1 : b === '(Trống)' ? -1 : a.localeCompare(b, 'vi', { numeric: true })));
  return order.map((k) => ({ k, n: cnt[k] }));
}

export { vnorm };

/* ---------- tìm kiếm ---------- */
const fnorm = (x: string, cs: boolean) => (cs ? String(x) : String(x).toLowerCase());

export function hitText(hay: string, F: FindState): boolean {
  const h = fnorm(hay, F.cs);
  const q = fnorm(F.q.trim(), F.cs);
  if (!q) return false;
  return F.whole ? h.trim() === q : h.includes(q);
}

export function scopeHas(s: AppState, f: Field): boolean {
  const F = s.find;
  if (F.scope === 'week') return f.grp === 'w3';
  if (F.scope === 'col') return s.sel ? f.id === s.sel.f : true;
  return f.kind !== 'future' && f.kind !== 'none';
}

export const hitCell = (s: AppState, r: Row, f: Field): boolean =>
  scopeHas(s, f) && hitText(displayText(s, r, f), s.find);

export interface FindMatch { i: number; f: string; t: string }

export function findMatches(s: AppState): FindMatch[] {
  if (!s.find.q.trim()) return [];
  const out: FindMatch[] = [];
  const vf = visibleFields(s).filter((f) => scopeHas(s, f));
  const rows = selectRows(s);
  GROUPS.forEach((g) => rows.forEach((r) => {
    if (r.g !== g.k) return;
    vf.forEach((f) => { const t = displayText(s, r, f); if (t && hitText(t, s.find)) out.push({ i: r.i, f: f.id, t }); });
  }));
  return out;
}

/** tách chuỗi theo từ khoá để tô vàng: [{text, mark}] */
export function markParts(text: string, q: string, cs: boolean): Array<{ text: string; mark: boolean }> {
  const src = String(text);
  const h = fnorm(src, cs);
  const n = fnorm(q.trim(), cs);
  if (!n) return [{ text: src, mark: false }];
  const out: Array<{ text: string; mark: boolean }> = [];
  let from = 0;
  let at: number;
  while ((at = h.indexOf(n, from)) >= 0) {
    if (at > from) out.push({ text: src.slice(from, at), mark: false });
    out.push({ text: src.slice(at, at + n.length), mark: true });
    from = at + n.length;
  }
  if (from < src.length) out.push({ text: src.slice(from), mark: false });
  return out;
}

export function snippetParts(t: string, F: FindState) {
  const flat = t.replace(/\n+/g, ' · ');
  const h = fnorm(flat, F.cs);
  const at = h.indexOf(fnorm(F.q.trim(), F.cs));
  const a = Math.max(0, at - 26);
  const b = Math.min(flat.length, at + F.q.trim().length + 44);
  return { pre: a > 0, post: b < flat.length, parts: markParts(flat.slice(a, b), F.q, F.cs) };
}

export const refOf = (r: Row, f: Field) => f.col + (r.tplRow || '+');

/* ---------- danh sách dòng hiển thị & thứ tự dòng ---------- */
export function visibleList(s: AppState, rows: Row[]): Row[] {
  const q = s.search.trim().toLowerCase();
  const vf = visibleFields(s);
  return rows.filter((r) => {
    if (q && (r.code + ' ' + r.task).toLowerCase().indexOf(q) < 0) return false;
    if (s.onlyFix && !needsFix(s, r)) return false;
    if (!passColFilters(s, r)) return false;
    if (s.find.open && s.find.filter && s.find.q.trim() && !vf.some((f) => hitCell(s, r, f))) return false;
    return true;
  });
}

/** thứ tự hiển thị của các dòng (theo nhóm, đã lọc, sắp xếp, bỏ nhóm thu gọn) — dùng cho điều hướng phím */
export function rowOrder(s: AppState): number[] {
  const list = visibleList(s, selectRows(s));
  const out: number[] = [];
  GROUPS.forEach((g) => {
    if (s.collapsed[g.k]) return;
    sortRows(s, list.filter((r) => r.g === g.k)).forEach((r) => out.push(r.i));
  });
  return out;
}

/* ---------- vùng chọn ---------- */
export const navFields = (s: AppState) => visibleFields(s).map((f) => f.id);

export function selKeys(s: AppState): string[] {
  const sel = s.sel;
  if (!sel) return [];
  if (!s.range) return [ck(sel.i, sel.f)];
  const vf = navFields(s);
  const order = rowOrder(s);
  const ra = order.indexOf(s.range.a.i);
  const rb = order.indexOf(s.range.b.i);
  const ca = vf.indexOf(s.range.a.f);
  const cb = vf.indexOf(s.range.b.f);
  if (ra < 0 || rb < 0 || ca < 0 || cb < 0) return [ck(sel.i, sel.f)];
  const out: string[] = [];
  for (let r = Math.min(ra, rb); r <= Math.max(ra, rb); r++) {
    for (let c = Math.min(ca, cb); c <= Math.max(ca, cb); c++) out.push(ck(order[r], vf[c]));
  }
  return out;
}

export function rangeBox(s: AppState) {
  const O = rowOrder(s);
  const F = navFields(s);
  const a = s.range ? s.range.a : s.sel!;
  const b = s.range ? s.range.b : s.sel!;
  const r1 = O.indexOf(a.i), r2 = O.indexOf(b.i), c1 = F.indexOf(a.f), c2 = F.indexOf(b.f);
  return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2), O, F };
}

/** Ctrl+mũi tên: nhảy tới mép vùng có dữ liệu như Excel */
export function edgeJump(s: AppState, dr: number, dc: number): { i: number; f: string } {
  const cur = s.range && s.range.b ? s.range.b : s.sel!;
  const O = rowOrder(s);
  const F = navFields(s);
  const filled = (i: number, fid: string) => !!displayText(s, s.allRows[i], fieldOf(s, fid)).trim();
  const at = (r: number, c: number) => filled(O[r], F[c]);
  const inb = (r: number, c: number) => r >= 0 && r < O.length && c >= 0 && c < F.length;
  let r = O.indexOf(cur.i);
  let c = F.indexOf(cur.f);
  if (inb(r + dr, c + dc) && at(r, c) && at(r + dr, c + dc)) {
    while (inb(r + dr, c + dc) && at(r + dr, c + dc)) { r += dr; c += dc; }
  } else {
    r += dr; c += dc;
    while (inb(r, c) && !at(r, c)) { r += dr; c += dc; }
    if (!inb(r, c)) { r -= dr; c -= dc; }
  }
  return { i: O[Math.max(0, Math.min(O.length - 1, r))], f: F[Math.max(0, Math.min(F.length - 1, c))] };
}

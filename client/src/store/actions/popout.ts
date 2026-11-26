/* Cửa sổ chi tiết dự án (bấm Mã DA): tìm trong thẻ, đi giữa kết quả / dự án, gập mục, tuần, cỡ chữ, vách kéo.
   Port từ prototype v4 (PO, poOpen/poGo/poClose, Phương án A L12303+). Gập mục, tuần, cỡ chữ giữ nguyên giữa các lần mở. */
import type { Draft } from 'immer';
import { poHitsCompute } from '@/lib/popout';
import type { AppState } from '@/types';
import { getState, LS, lsSet, mutate, rowsOf } from '@/store';

/* tính lại kết quả tìm sau mỗi thay đổi (prototype poRender) */
function rehit(d: Draft<AppState>): void {
  const P = d.po, r = P.i === null ? undefined : d.allRows[P.i];
  P.hits = r ? poHitsCompute(r, P.q, P.wkDesc, d) : [];
  if (P.cur >= P.hits.length) P.cur = P.hits.length ? 0 : -1;
}

export function poOpen(i: number): void {
  mutate((d) => { Object.assign(d.po, { open: true, i, q: '', cur: -1, rowH: {} }); rehit(d); });
}
export function poClose(): void { mutate((d) => { d.po.open = false; }); }

/** Ô tìm #poQ: tới kết quả đầu và mở mục chứa nó. */
export function poSetQuery(q: string): void {
  mutate((d) => {
    const P = d.po;
    P.q = q; P.cur = -1; rehit(d);
    if (P.hits.length) { P.cur = 0; delete P.col[P.hits[0].sec]; }
  });
}
/** ↑ / ↓, Enter, F3: kết quả trước / kế (vòng). */
export function poNavMatch(dir: 1 | -1): void {
  mutate((d) => {
    const P = d.po, n = P.hits.length; if (!n) return;
    P.cur = P.cur < 0 ? (dir > 0 ? 0 : n - 1) : (P.cur + dir + n) % n;
    delete P.col[P.hits[P.cur].sec];
  });
}
/** Dự án trước / sau trong bảng (giữ trạng thái gập mục). */
export function poNavProject(dir: 1 | -1): void {
  const s = getState(), rows = rowsOf(s), ix = rows.findIndex((r) => r.i === s.po.i) + dir;
  if (rows[ix]) poOpen(rows[ix].i);
}
export function poToggleGroup(g: string): void { mutate((d) => { if (d.po.col[g]) delete d.po.col[g]; else d.po.col[g] = true; }); }
/** Mở hết / gập hết các mục. */
export function poToggleAll(shut: boolean): void {
  mutate((d) => { d.po.col = shut ? { info: true, prog: true, org: true, eval: true, wk: true } : {}; });
}
export function poToggleWeek(w: string): void { mutate((d) => { d.po.wkOpen[w] = !d.po.wkOpen[w]; }); }
/** "Xem thêm / Thu gọn" của Mục tiêu, KPI, Milestone. */
export function poToggleExp(fid: string): void { mutate((d) => { d.po.exp[fid] = !d.po.exp[fid]; }); }
/** "Mới nhất trước ⇅". */
export function poToggleWkSort(): void { mutate((d) => { d.po.wkDesc = !d.po.wkDesc; d.po.cur = -1; rehit(d); }); }

/** Nút A / A: cỡ chữ 11–22px, lưu pmo-po-fz. */
export function poSetFontSize(delta: number): void {
  mutate((d) => { d.po.fz = Math.max(11, Math.min(22, d.po.fz + delta)); });
  lsSet(LS.poFz, String(getState().po.fz));
}
/** Vách kéo giữa 2 cột (`maxW` do giao diện đo); `null` = nhấp đúp về 300px. Lưu pmo-po-sidew. */
export function poSetSideW(w: number | null, maxW = Infinity): void {
  mutate((d) => { d.po.sideW = w === null ? 300 : Math.max(200, Math.min(maxW, Math.round(w))); });
  lsSet(LS.poSideW, String(getState().po.sideW));
}

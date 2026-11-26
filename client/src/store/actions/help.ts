/* Trung tâm hướng dẫn (nút ?) và tour từng bước. Port từ prototype v4: helpHTML/helpTourStart, tourGo/tourEnd. */
import type { Draft } from 'immer';
import { TOURS } from '@/data/constants';
import type { AppState, TourKey } from '@/types';
import { getState, LS, lsGet, lsSet, mutate } from '@/store';

export function helpOpenPanel(): void { mutate((d) => { d.help = true; d.helpQ = ''; d.menu = null; }); }
export function helpClose(): void { mutate((d) => { d.help = false; }); }
export function helpToggleTopic(k: string): void { mutate((d) => { d.helpOpen = d.helpOpen === k ? null : k; }); }
export function helpSetQuery(q: string): void { mutate((d) => { d.helpQ = q; }); }

/* màn cần mở sẵn trước bước tour (thay hàm prep của prototype) */
function tourStep(d: Draft<AppState>, n: number): void {
  const T = TOURS[d.tourKey];
  if (n < 0) return;
  if (n >= T.length) { d.tour = null; return; }
  d.tour = n; d.menu = null; d.modal = null; d.pop = null;
  const st = T[n];
  if (st.view === 'grid') { d.view = 'grid'; d.onlyFix = false; d.search = ''; d.collapsed = {}; d.panel = null; delete d.hidden.tt; }
  else if (st.view === 'import') { d.view = 'import'; d.panel = null; }
  else if (st.view) d.view = st.view;
  if (st.ver) d.verSel = st.ver;
}

/** Chạy một tour (đóng ngăn hướng dẫn). Dùng trong recipe khác, ví dụ lần đầu mở Phiên bản. */
export function startTour(d: Draft<AppState>, k: TourKey): void {
  d.help = false; d.tourKey = k;
  tourStep(d, 0);
}

export function helpTourStart(k: TourKey): void { mutate((d) => startTour(d, k)); }
/** Tới bước `n` của tour đang chạy; quá bước cuối là kết thúc. */
export function tourGo(n: number): void {
  mutate((d) => tourStep(d, n));
  if (getState().tour === null) lsSet(LS.tourMain, '1');
}
export function tourExit(): void { mutate((d) => { d.tour = null; }); lsSet(LS.tourMain, '1'); }
/** Lần đầu mở ứng dụng (chưa từng xem hay bỏ qua tour nào): tự chạy tour tổng quan (prototype L6503). */
export function tourAutoStart(): void {
  if (lsGet(LS.tourMain) === null) mutate((d) => { d.tourKey = 'all'; d.tour = 0; });
}

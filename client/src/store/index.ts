/* Store gốc (Zustand + Immer): state ban đầu, `mutate` một bước, hoàn tác 100 bước, lịch sử màn 50 bước,
   nhật ký/thông báo và lưu localStorage an toàn (không chạm trình duyệt khi chạy trong node/SSR). */
import { create } from 'zustand';
import { castDraft, produce, type Draft } from 'immer';
import { FIELDS } from '@/data/constants';
import type { AppState, FieldId, LogResult, NavSnap, Row, UndoSnap, VersionItem } from '@/types';

/* ---------- trình duyệt & localStorage ---------- */
export const inBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

export function lsGet(key: string): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); } catch { return null; }
}
/** Ghi localStorage; trả `false` khi không có hoặc bị chặn/đầy. */
export function lsSet(key: string, value: string): boolean {
  try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(key, value); return true; } catch { return false; }
}
export function lsJson<T>(key: string): Partial<T> {
  try { return (JSON.parse(lsGet(key) || 'null') as Partial<T> | null) || {}; } catch { return {}; }
}

export const LS = {
  store: 'pmo-proto-store-v1', grid: 'pmo-proto-grid-v1', poSideW: 'pmo-po-sidew', poFz: 'pmo-po-fz',
  panel: 'pmo-proto-panel-v1', tourVer: 'pmo-tour-ver', tourMain: 'pmo-tour-v1', cols: 'pmo-proto-cols-v4'
} as const;

/* ---------- đồng hồ (thay được trong test) ---------- */
let clock: () => Date = () => new Date();
export const setNow = (fn: () => Date): void => { clock = fn; };
export const now = (): Date => clock();
const p2 = (n: number): string => String(n).padStart(2, '0');
/** "dd/mm hh:mm" như prototype nowStr(). */
export function nowStr(): string {
  const d = now();
  return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}

/* ---------- state ban đầu ---------- */
const NAV_F = ['view', 'vlView', 'verSel', 'vlA', 'vlB', 'panel'] as const;
export const navKey = (s: Pick<AppState, (typeof NAV_F)[number]>): string => NAV_F.map((k) => String(s[k] ?? '')).join('|');
const navSnap = (s: AppState): NavSnap => ({ view: s.view, vlView: s.vlView, verSel: s.verSel, vlA: s.vlA, vlB: s.vlB, panel: s.panel, key: navKey(s) });

/* bản đã chốt lưu trên "hệ thống" (localStorage) gộp với bản có sẵn, tuần mới trước, bản mới trước */
export function sortVersions(L: VersionItem[]): VersionItem[] {
  return L.sort((a, b) => (a.wk === b.wk ? b.v - a.v : a.wk < b.wk ? 1 : -1));
}
function loadVersions(): VersionItem[] {
  const L: VersionItem[] = [];
  (lsJson<{ versions: VersionItem[] }>(LS.store).versions || []).slice().reverse().forEach((v) => {
    if (!L.some((x) => x.wk === v.wk && x.v === v.v)) L.unshift(v);
  });
  return sortVersions(L);
}

export function initialState(): AppState {
  const gx = lsJson<AppState['gx']>(LS.grid), pn = lsJson<AppState['pn']>(LS.panel), cols = lsJson<{ hidden: AppState['hidden']; pin: boolean }>(LS.cols);
  const s: AppState = {
    view: 'import', panel: null, modal: null, loaded: false, importing: null, fileName: '',
    realOnly: true, newCodes: 'pending', dupMerged: false, phaseBucket: {}, unsorted: [],
    cycleId: '2026_11_w3', weeks: [], activeToday: '', sessionId: null, fileCols: [], fileStats: null, groups: [], applied: null,
    orphans: [], blockers: [], warnings: [], mappings: [], mpUsed: null, mpSrc: {}, mpDirty: false, mpSave: false, busy: false, importErr: null,
    allRows: [], sel: null, range: null, search: '', onlyFix: false, collapsed: {}, rowSel: {},
    hidden: cols.hidden || { x: true, mang: true }, pinViec: cols.pin !== false, menu: null, pop: null, pk: null, pe: null, peAuto: true, svflash: [], fpop: null, ctx: null, colFilter: {}, sort: null,
    fmt: {}, wrap: {},
    find: { open: false, q: '', cs: false, whole: false, scope: 'all', all: false, filter: false, idx: -1, focus: false, caret: null },
    scrollSel: false, navScroll: false, findScroll: false,
    gx: { zoom: gx.zoom || 100, rowH: gx.rowH || {}, colW: gx.colW || {} },
    pn: { w: pn.w || {}, col: pn.col || {}, big: pn.big || null },
    askLog: [], stages: {}, trace: null, trEdit: null, trVar: {}, trBusy: null, trReq: false, walk: null, aiRun: null, review: null,
    po: {
      open: false, i: null, fz: Number(lsGet(LS.poFz)) || 14, col: {}, q: '', hits: [], cur: -1, wkDesc: true,
      colW: {}, rowH: {}, sideW: Number(lsGet(LS.poSideW)) || 300, exp: {}, wkOpen: { w3: true }
    },
    versions: loadVersions(), verSel: null, vlView: 'lib', vlA: null, vlB: null, editWk: null,
    vlOpen: null, vbA: null, vbB: null, vbMore: false, openedVer: null,
    lockBy: 'Khuê', lockMsg: null, exported: null, exCols: 'vis',
    log: [], lgQ: '', lgF: '', lgW: '',
    help: false, helpQ: '', helpOpen: null, tour: null, tourKey: 'all', toast: null, pv: null, pvSheet: 0, pvFs: false, impHist: [], replaceFile: false, impF: 'all', histOpen: false,
    nav: { st: [], ix: -1 }, undoStack: [], redoStack: [],
    touched: {}, fixPos: {}, fxTip: null, logSeq: 0, lockSeq: 0, stgSeq: 0
  };
  s.nav = { st: [navSnap(s)], ix: 0 };
  return s;
}

export const useAppState = create<AppState>()((_set, get, api) => {
  /* renderToString (SSR/test) đọc state hiện tại thay vì state lúc tạo store */
  (api as { getServerState?: () => AppState }).getServerState = get;
  return initialState();
});
export const getState = (): AppState => useAppState.getState();
export const resetStore = (): void => { useAppState.setState(initialState(), true); };

/* ---------- hoàn tác: ảnh chụp ô sửa tay, nháp AI, cột nhập tay, định dạng, xuống dòng ---------- */
const MAN_IDS = FIELDS.filter((f) => f.kind === 'manual').map((f) => f.id);
type TextRow = Partial<Record<FieldId, string>>;

export function undoSnap(s: AppState): UndoSnap {
  return {
    n: s.allRows.length,
    r: s.allRows.map((r) => {
      const m: TextRow = {};
      MAN_IDS.forEach((k) => { const v = (r as TextRow)[k]; if (v !== undefined) m[k] = v; });
      return { o: r.ovr, a: r.ai, m };
    }),
    f: s.fmt, w: s.wrap
  };
}
/** Đưa bảng về một ảnh chụp; `false` nếu số dòng đã đổi (nhập file khác). */
export function restoreSnap(d: Draft<AppState>, x: UndoSnap): boolean {
  if (x.n !== d.allRows.length) return false;
  d.allRows.forEach((r, i) => {
    const y = x.r[i];
    r.ovr = castDraft(y.o || {}); r.ai = castDraft(y.a || {});
    MAN_IDS.forEach((k) => { const t = r as TextRow; if (y.m[k] === undefined) delete t[k]; else t[k] = y.m[k]; });
  });
  d.fmt = castDraft(x.f || {}); d.wrap = x.w || {};
  return true;
}
function clearUndo(next: AppState, d: Draft<AppState>): void {
  if (next.undoStack.length || next.redoStack.length) { d.undoStack = []; d.redoStack = []; }
}
/* hoàn tác không vượt qua ranh giới dữ liệu: chưa nạp, nạp lại file (`resetUndo`) */
function trackUndo(prev: AppState, next: AppState, d: Draft<AppState>): void {
  if (!next.loaded) return clearUndo(next, d);
  if (!prev.loaded || (prev.allRows === next.allRows && prev.fmt === next.fmt && prev.wrap === next.wrap)) return;
  const a = undoSnap(prev), b = undoSnap(next);
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a.n !== b.n) { d.undoStack = []; d.redoStack = []; return; }
  d.undoStack.push(castDraft(a));
  if (d.undoStack.length > 100) d.undoStack.shift();
  d.redoStack = [];
}

function trackNav(next: AppState, d: Draft<AppState>): void {
  const cur = next.nav.st[next.nav.ix];
  if (cur && cur.key === navKey(next)) return;
  d.nav.st = d.nav.st.slice(0, d.nav.ix + 1);
  d.nav.st.push(navSnap(next));
  if (d.nav.st.length > 50) d.nav.st.shift();
  d.nav.ix = d.nav.st.length - 1;
}

/** Một thao tác người dùng = một lần gọi. Mặc định tự ghi lịch sử hoàn tác và lịch sử màn;
    `track: false` dùng cho chính undo/redo và nút quay lại/tiến tới; `resetUndo` xoá lịch sử hoàn tác (dữ liệu bảng được thay mới). */
export function mutate(recipe: (d: Draft<AppState>) => void, opts: { track?: boolean; resetUndo?: boolean } = {}): void {
  const prev = getState();
  const next = produce(prev, recipe);
  if (next === prev) return;
  useAppState.setState(opts.track === false ? next : produce(next, (d) => {
    if (opts.resetUndo) clearUndo(next, d); else trackUndo(prev, next, d);
    trackNav(next, d);
  }), true);
}

/** Bỏ phần gắn với dòng cũ khi bảng được thay mới: bản xem trước đang mở (giữ chỉ số dòng cũ) và dấu ô đã sửa. */
export function dropRowSession(d: Draft<AppState>): void {
  Object.values(d.stages).forEach((S) => { if (S.st === 'open') S.st = 'dropped'; });
  d.touched = {};
  /* các lớp của bảng cũng giữ chỉ số dòng cũ: khung soạn, dropdown, menu chuột phải, nhãn "cần sửa", ô nháy, duyệt từng ô, dòng đang tick */
  d.pe = null; d.pk = null; d.ctx = null; d.fxTip = null; d.svflash = []; d.review = null; d.rowSel = {};
}

/* ---------- nhật ký & thông báo (gọi bên trong recipe) ---------- */
export function log(d: Draft<AppState>, a: string, o: string, detail: string, r: LogResult = 'Thành công'): void {
  const t = now();
  d.logSeq++;
  d.log.unshift({ t: p2(t.getHours()) + ':' + p2(t.getMinutes()), a, o, d: detail, r, day: p2(t.getDate()) + '/' + p2(t.getMonth() + 1) + '/' + t.getFullYear(), seq: d.logSeq });
}

export function toast(d: Draft<AppState>, m: string, ms = 2200): void {
  d.toast = m;
  if (inBrowser()) setTimeout(() => { if (getState().toast === m) mutate((x) => { x.toast = null; }); }, ms);
}

/* ---------- dữ liệu dẫn xuất ---------- */
/** Các dòng đưa vào báo cáo (prototype `rows`): bỏ mã mới chưa thêm, dòng trùng đã gộp, dòng giả khi chỉ dùng dữ liệu thật. */
export const rowsOf = (s: Pick<AppState, 'allRows' | 'newCodes' | 'dupMerged' | 'realOnly'>): Row[] =>
  s.allRows.filter((r) => (!r.isNew || s.newCodes === 'added') && (!r.dup || !s.dupMerged) && (!s.realOnly || r.real));

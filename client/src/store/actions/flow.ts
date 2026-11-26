/* Luồng 3 bước (Nhập file → Điền & duyệt → Chốt & xuất): nạp file thật qua máy chủ, cấu hình mapping, chuyển màn.
   Dữ liệu bảng chỉ đến từ POST /ingest/upload, GET /sessions/{id} và POST /mapping/recalculate (xem services/api.ts). */
import { castDraft, type Draft } from 'immer';
import { FIELDS, setCycle } from '@/data/constants';
import { cellValue } from '@/lib/cell';
import { foundFromResponse } from '@/lib/importSteps';
import { toggleTheme, type Theme } from '@/lib/theme';
import { pvParse } from '@/lib/xlsx';
import { api, ApiError } from '@/services/api';
import type {
  AiFieldId, AppState, IngestResponse, MappingColumnDef, MappingConfigOut, ModalType, PanelType, PreviewFile, ValueMappings, ViewType
} from '@/types';
import {
  cancelPendingDraftSave, dropRowSession, getActiveSessionStorage, getState, hydrateDraft, inBrowser, log, lsGet, lsSet, LS, mutate, rowsOf,
  setActiveSessionStorage, sortVersions, toast, withSuppressedDraftSync
} from '@/store';
import { startTour } from './help';

export const IMPORT_STEPS: readonly string[] = ['Đọc file và nhận diện cột', 'Gộp các cột trùng tên', 'Tách mã dự án, ghép vào 49 cột mẫu', 'So với tuần trước và cấu hình đã lưu'];
/** Màn Đang đọc hiện từng bước (IMPORT_STEP_MS) rồi dừng IMPORT_END_MS: tổng 3 giây để người dùng kịp đọc số liệu thật. */
export const IMPORT_STEP_MS = 650;
export const IMPORT_END_MS = 400;
let endHold: (() => void) | null = null;
let skipRequested = false;
const reducedMotion = (): boolean => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const holdFor = (ms: number): Promise<void> => new Promise((resolve) => {
  const t = setTimeout(() => { endHold = null; resolve(); }, ms);
  endHold = () => { clearTimeout(t); endHold = null; resolve(); };
});
/** "Xem tóm tắt ngay": bỏ qua phần chờ. */
export function skipImportWait(): void { skipRequested = true; endHold?.(); }

const errMsg = (e: unknown): string => (e instanceof ApiError ? e.message : 'Có lỗi không mong đợi, thử lại sau.');
const ERROR_TOAST_MS = 6000; // lỗi dài hơn thông báo thường để kịp đọc
const failUpload = (e: unknown): void => mutate((d) => { d.importErr = errMsg(e); d.importing = null; d.busy = false; });
const failToast = (e: unknown): void => mutate((d) => { toast(d, errMsg(e), ERROR_TOAST_MS); d.importing = null; d.busy = false; });

/* ---------- dữ liệu nền từ máy chủ ---------- */
/** Kỳ báo cáo, lịch sử nhập file, cấu hình mapping đã lưu: gọi một lần khi mở trang. */
export async function initStage1Bootstrap(): Promise<void> {
  const active = getActiveSessionStorage();
  const restore = active ? Promise.all([api.getSession(active.sessionId), api.getDraft(active.sessionId)]) : null; // song song, không chờ nền
  restore?.catch(() => undefined); // lỗi được xử lý ở dưới; tránh unhandled rejection khi còn đang chờ dữ liệu nền
  const [cyc, hist, maps, vers] = await Promise.allSettled([api.getActiveCycle(), api.getIngestHistory(), api.listMappings(), api.listVersions()]);
  if (cyc.status === 'fulfilled') setCycle(cyc.value.today, cyc.value.weeks);
  withSuppressedDraftSync(() => mutate((d) => {
    if (cyc.status === 'fulfilled') { d.cycleId = cyc.value.cycle_id; d.weeks = cyc.value.weeks; d.activeToday = cyc.value.today; }
    if (hist.status === 'fulfilled') d.impHist = hist.value;
    if (maps.status === 'fulfilled') d.mappings = castDraft(maps.value);
    if (vers.status === 'fulfilled') d.versions = sortVersions(castDraft(vers.value));
    const bad = [cyc, hist, maps, vers].find((r) => r.status === 'rejected');
    if (bad && bad.status === 'rejected') toast(d, errMsg(bad.reason));
  }, { track: false }));
  if (!active || !restore) return;
  try {
    const [res, draft] = await restore;
    withSuppressedDraftSync(() => mutate((d) => {
      commit(d, res, getState().mappings);
      d.mpSrc = {}; d.mpDirty = false; d.mpSave = false;
      if (draft) hydrateDraft(d, draft); else { resetDraftFields(d); importLog(d, res); }
      d.view = active.view; d.restoringSession = false;
    }, { resetUndo: true }));
  } catch (e) {
    // 4xx: phiên không còn hợp lệ; lỗi mạng/5xx: giữ lại để thử lại ở lần mở sau. Cả hai: không có dữ liệu thì về Nhập file.
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) setActiveSessionStorage(null);
    withSuppressedDraftSync(() => mutate((d) => { d.restoringSession = false; if (!d.loaded) d.view = 'import'; }, { track: false }));
  }
}

/** Phiên chưa có bản nháp: đưa phần định dạng/nhật ký về mặc định để không rò từ phiên trước sang. */
const resetDraftFields = (d: Draft<AppState>): void => {
  d.fmt = {}; d.wrap = {}; d.touched = {}; d.hidden = { x: true, mang: true }; d.pinViec = true; d.exCols = 'vis'; d.lockBy = 'Khuê';
  d.log = []; d.logSeq = 0; d.lockSeq = 0;
};

const importLog = (d: Draft<AppState>, res: IngestResponse): void => {
  const st = res.file_stats;
  log(d, 'Nhập file Jira', res.file_name, st.total_cols + ' cột · gộp ' + st.dup_groups + ' nhóm cột trùng tên · ' + st.matched_projects + ' dự án ghép được · ' + res.orphans.length + ' issue chưa ghép', res.orphans.length ? 'Cảnh báo' : 'Thành công');
};

const refreshHistory = (): Promise<void> => api.getIngestHistory().then((h) => mutate((d) => { d.impHist = h; }, { track: false }), () => undefined);
const refreshMappings = async (): Promise<MappingConfigOut[]> => {
  const list = await api.listMappings();
  mutate((d) => { d.mappings = castDraft(list); }, { track: false });
  return list;
};

/* ---------- Bước 1 · nạp / mở lại / tính lại ---------- */
function commit(d: Draft<AppState>, res: IngestResponse, mappings: MappingConfigOut[]): void {
  d.allRows = castDraft(res.rows);
  d.realOnly = true; d.newCodes = 'added'; d.dupMerged = true; d.unsorted = [];
  d.sessionId = res.session_id; d.fileName = res.file_name; d.fileCols = res.file_cols; d.fileStats = res.file_stats;
  d.groups = res.groups; d.applied = res.applied_mapping.id ? res.applied_mapping : null;
  d.orphans = res.orphans; d.blockers = res.blockers; d.warnings = res.warnings;
  d.mpUsed = res.applied_mapping.id || null;
  d.phaseBucket = mappings.find((m) => m.id === d.mpUsed)?.value_mappings.phase_bucket || {};
  dropRowSession(d);
  d.loaded = true; d.modal = null; d.importing = null; d.replaceFile = false; d.busy = false;
}

/** Tải lại bảng từ một phản hồi của máy chủ (mở lại phiên cũ, chọn cấu hình khác, đổi nguồn cột). */
export function applyIngest(res: IngestResponse, opts: { dirty?: boolean; src?: Record<string, string>; keepTouched?: boolean } = {}): void {
  const touched = opts.keepTouched ? getState().touched : {}; // commit() xoá dấu ô đã sửa; tính lại (cùng phiên) giữ lại vì máy chủ đã gộp sẵn phần nháp
  withSuppressedDraftSync(() => mutate((d) => {
    commit(d, res, getState().mappings);
    d.touched = touched;
    d.mpSrc = opts.src || {}; d.mpDirty = !!opts.dirty; d.mpSave = false;
  }, { resetUndo: true }));
}

/** "Đọc file này": gửi file thật lên máy chủ. Màn "Đang đọc" chạy từng bước trong lúc chờ, bước cuối giữ tới khi có kết quả. */
export async function uploadFile(file: File, mappingId?: string | null, forceReload = false): Promise<void> {
  if (getState().busy) return;
  mutate((d) => { d.busy = true; d.importErr = null; d.importing = { name: file.name, step: 0 }; d.view = 'import'; d.modal = null; });
  skipRequested = false;
  cancelPendingDraftSave();
  try {
    const res = await api.ingestUpload(file, getState().cycleId, mappingId ?? getState().mpUsed, forceReload);
    const draft = res.is_duplicate_file ? await api.getDraft(res.session_id).catch(() => null) : null;
    const cancelled = (): boolean => { if (getState().importing) return false; mutate((d) => { d.busy = false; }, { track: false }); return true; };
    if (cancelled()) return;
    mutate((d) => { if (d.importing) d.importing.found = foundFromResponse(res); }, { track: false });
    if (inBrowser() && !reducedMotion()) {
      for (let k = 1; k <= IMPORT_STEPS.length && !skipRequested; k++) {
        await holdFor(IMPORT_STEP_MS);
        if (cancelled()) return;
        if (!skipRequested) mutate((d) => { if (d.importing) d.importing.step = k; }, { track: false });
      }
      if (!skipRequested) await holdFor(IMPORT_END_MS);
    }
    if (cancelled()) return;
    withSuppressedDraftSync(() => mutate((d) => {
      commit(d, res, getState().mappings); d.mpSrc = {}; d.mpDirty = false; d.mpSave = false;
      if (d.pv) d.pv.done = true;
      if (draft) hydrateDraft(d, draft);
      if (res.is_duplicate_file) toast(d, 'File này đã nhập trước đó, đang mở lại kết quả cũ');
      if (!draft) importLog(d, res);
    }, { resetUndo: true }));
    void refreshHistory();
  } catch (e) { failUpload(e); }
}

/** "Nhập lại file này" / chọn file cũ hơn: nạp lại phiên đã lưu. */
export async function reopenSession(sessionId: string): Promise<void> {
  if (getState().busy) return;
  mutate((d) => { d.busy = true; });
  try {
    cancelPendingDraftSave();
    const [res, draft] = await Promise.all([api.getSession(sessionId), api.getDraft(sessionId)]);
    withSuppressedDraftSync(() => {
      applyIngest(res);
      mutate((d) => {
        if (draft) { hydrateDraft(d, draft); log(d, 'Mở lại lần nhập', res.file_name, res.file_stats.matched_projects + ' dự án'); }
        else { resetDraftFields(d); importLog(d, res); }
      });
    });
  } catch (e) { failToast(e); }
}

/** Tính lại bảng với cấu hình `mappingId` và các nguồn cột đang đổi tạm (chưa lưu). */
async function recalc(mappingId: string | null, src: Record<string, string>, dirty: boolean): Promise<boolean> {
  const sid = getState().sessionId;
  if (!sid || getState().busy) return false;
  mutate((d) => { d.busy = true; });
  try {
    const res = await api.recalculate({ session_id: sid, mapping_id: mappingId, src_overrides: src });
    applyIngest(res, { dirty, src, keepTouched: true });
    return true;
  } catch (e) { failToast(e); return false; }
}

/* ---------- Bước 1 · cấu hình mapping (mpBar + mapQuick) ---------- */
export const mpCurrent = (s: Pick<AppState, 'mappings' | 'mpUsed'>): MappingConfigOut | undefined => s.mappings.find((m) => m.id === s.mpUsed);

/** Chọn cấu hình khác ở ô chọn của mpBar; '' = quay lại cấu hình mặc định của hệ thống. */
export async function mpPick(id: string): Promise<void> {
  const ok = await recalc(id || null, {}, false);
  if (ok) mutate((d) => { const m = mpCurrent(d); log(d, 'Dùng cấu hình mapping', m?.name || 'mặc định', 'khớp ' + (d.applied?.matched_cols ?? 0) + '/' + (d.applied?.total_cols ?? 49) + ' cột'); toast(d, 'Đang dùng mapping “' + (m?.name || 'mặc định') + '”'); });
}

/** Đổi nguồn một cột Jira (mapQuick): xem trước ngay từ file gốc, chưa lưu cấu hình. */
export async function mpQuickChange(fid: string, col: string): Promise<void> {
  const s = getState(), src = { ...s.mpSrc };
  if (col === srcBase(s, fid)) delete src[fid]; else src[fid] = col;
  await recalc(s.mpUsed, src, Object.keys(src).length > 0);
}

/** Cột Jira cấu hình đang dùng gán cho cột báo cáo (chỉ khi file có cột đó), không thì '' = không lấy từ Jira. */
export function srcBase(s: Pick<AppState, 'mappings' | 'mpUsed' | 'fileCols'>, fid: string): string {
  const src = mpCurrent(s)?.columns.find((c) => c.field_id === fid)?.source_field || '';
  return s.fileCols.includes(src) ? src : '';
}

/** Cột của cấu hình đang dùng, đã gộp các nguồn đang đổi tạm. */
function mergedColumns(s: AppState, base: MappingConfigOut): MappingColumnDef[] {
  return base.columns.map((c) => (s.mpSrc[c.field_id] !== undefined
    ? { ...c, source_type: s.mpSrc[c.field_id] ? 'jira' : 'manual', source_field: s.mpSrc[c.field_id], fallbacks: [] } : c));
}
const valuesOf = (m: MappingConfigOut | undefined): ValueMappings => m?.value_mappings || { status_map: {}, progress_map: {}, phase_map: {}, phase_bucket: {} };

export function mpSaveOpen(on: boolean): void { mutate((d) => { d.mpSave = on; }, { track: false }); }

/** "Lưu thành cấu hình mới". */
export async function mpSaveNew(name: string): Promise<void> {
  const s = getState(), base = mpCurrent(s) || s.mappings.find((m) => m.is_default) || s.mappings[0];
  if (!name.trim()) return mutate((d) => toast(d, 'Đặt tên cho cấu hình trước'));
  if (!base) return mutate((d) => toast(d, 'Chưa có cấu hình mẫu để lưu'));
  try {
    const m = await api.createMapping({ name: name.trim(), description: null, columns: mergedColumns(s, base), value_mappings: valuesOf(base) });
    await refreshMappings();
    if (await recalc(m.id, {}, false)) mutate((d) => { log(d, 'Lưu cấu hình mapping', m.name, 'dùng lại cho lần nhập sau'); toast(d, 'Đã lưu cấu hình mapping “' + m.name + '”'); });
  } catch (e) { failToast(e); }
}

/** "Cập nhật “tên”": ghi các nguồn đã đổi vào cấu hình đang dùng. */
export async function mpUpdateProfile(): Promise<void> {
  const s = getState(), base = mpCurrent(s);
  if (!base) return;
  try {
    await api.updateMapping(base.id, { columns: mergedColumns(s, base) });
    await refreshMappings();
    if (await recalc(base.id, {}, false)) mutate((d) => { log(d, 'Cập nhật cấu hình mapping', base.name, ''); toast(d, 'Đã cập nhật “' + base.name + '”'); });
  } catch (e) { failToast(e); }
}

export async function mpCloneProfile(): Promise<void> {
  const s = getState(), base = mpCurrent(s) || s.mappings.find((m) => m.is_default);
  if (!base) return;
  try {
    const m = await api.cloneMapping(base.id);
    await refreshMappings();
    if (await recalc(m.id, {}, false)) mutate((d) => { log(d, 'Nhân bản cấu hình mapping', m.name, 'từ “' + base.name + '”'); toast(d, 'Đã nhân bản thành “' + m.name + '”'); });
  } catch (e) { failToast(e); }
}

export async function mpSetDefault(): Promise<void> {
  const s = getState(), base = mpCurrent(s);
  if (!base) return;
  try {
    await api.setDefaultMapping(base.id);
    await refreshMappings();
    mutate((d) => toast(d, '“' + base.name + '” là cấu hình mặc định, lần nhập sau tự dùng'));
  } catch (e) { failToast(e); }
}

export async function mpDeleteProfile(): Promise<void> {
  const s = getState(), base = mpCurrent(s);
  if (!base) return;
  try {
    await api.deleteMapping(base.id);
    await refreshMappings();
    if (await recalc(null, {}, false)) mutate((d) => toast(d, 'Đã xoá cấu hình “' + base.name + '”'));
  } catch (e) { failToast(e); }
}

/* ---------- 3 bước & chuyển màn ---------- */
export type Step = 1 | 3 | 4;

/** Bước đang đứng: 1 Nhập file, 3 Điền & duyệt (bảng), 4 Chốt & xuất (modal). */
export function curStep(s: Pick<AppState, 'modal' | 'view' | 'loaded'>): Step {
  if (s.modal === 'export') return 4;
  if (s.view === 'import' || !s.loaded) return 1;
  return 3;
}

export function goStep(n: Step): void {
  if (n !== 1 && n !== 3 && n !== 4) return;
  const s = getState(), latest = s.impHist[0];
  if (n > 1 && !s.loaded && latest) { // chưa nhập file mới nhưng hệ thống đã có file cũ: mở file gần nhất ở Bước 2 để kiểm tra
    void reopenSession(latest.session_id).then(() => {
      if (getState().loaded) mutate((d) => { d.modal = null; d.exported = null; d.view = 'grid'; toast(d, 'Chưa nhập file mới — đang mở dữ liệu từ file gần nhất: ' + latest.name); });
    });
    return;
  }
  mutate((d) => {
    d.pop = null; d.menu = null; d.panel = null;
    if (n > 1 && !d.loaded) return toast(d, 'Chưa có dữ liệu — nhập file ở bước 1 trước');
    if (n === 1) { d.modal = null; d.view = 'import'; }
    else if (n === 3) { d.modal = null; d.exported = null; d.view = 'grid'; }
    else { d.view = 'grid'; d.modal = 'export'; }
  });
}

/** Rail / tab: Bảng, Phiên bản, Nhật ký (và Nhập file). Lần đầu mở Phiên bản tự chạy tour của màn đó. */
export function setView(v: ViewType): void {
  mutate((d) => {
    d.view = v; d.modal = null;
    if (v === 'ver' && d.loaded && d.tour === null) {
      const seen = lsGet(LS.tourVer) !== null;
      if (lsSet(LS.tourVer, '1') && !seen) startTour(d, 'ver');
    }
  });
}

export function setPanel(p: PanelType): void { mutate((d) => { d.panel = p; }); }

export function setModal(m: ModalType): void {
  mutate((d) => {
    if (m === 'export' && !d.loaded) return toast(d, 'Chưa có dữ liệu — nhập file CSV ở bước 1 trước');
    d.modal = m; d.pop = null;
    if (!m) { d.exported = null; d.lockMsg = null; }
  });
}

/** Nút ‹ › (Alt+← / →): về màn trước / tới màn kế trong 50 màn gần nhất. */
export function navGo(dir: -1 | 1): void {
  mutate((d) => {
    const t = d.nav.st[d.nav.ix + dir];
    if (!t) return;
    d.nav.ix += dir;
    d.view = t.view; d.vlView = t.vlView; d.verSel = t.verSel; d.vlA = t.vlA; d.vlB = t.vlB; d.panel = t.panel;
    d.modal = null; d.menu = null; d.pop = null;
  }, { track: false });
}

/* ---------- khung bên phải: kéo rộng, phóng to, gập mục (lưu pmo-proto-panel-v1) ---------- */
const pnSave = (pn: AppState['pn']): void => { lsSet(LS.panel, JSON.stringify(pn)); };

export function pnSetWidth(k: string, w: number): void {
  mutate((d) => { d.pn.w[k] = Math.round(w); if (d.pn.big === k) d.pn.big = null; });
  pnSave(getState().pn);
}
export function pnToggleBig(k: string): void {
  mutate((d) => { d.pn.big = d.pn.big === k ? null : k; });
  pnSave(getState().pn);
}
export function pnToggleSec(id: string): void {
  mutate((d) => { if (d.pn.col[id]) delete d.pn.col[id]; else d.pn.col[id] = true; });
  pnSave(getState().pn);
}

/* ---------- thanh trên: số ô còn phải điền/duyệt (badge bước 2), giao diện sáng/tối ---------- */
/** Ô bắt buộc còn trống + nháp AI chưa duyệt (prototype fillCount). */
export function fillCount(s: AppState): number {
  if (!s.loaded) return 0;
  let n = 0;
  rowsOf(s).forEach((r) => FIELDS.forEach((f) => {
    if (f.kind === 'ai') { const a = r.ai[f.id as AiFieldId]; if ((f.required && !a) || (a && !a.ok)) n++; }
    else if (f.required && cellValue(r, f, s) === null) n++;
  }));
  return n;
}

export function themeToggle(): Theme {
  const t = toggleTheme();
  mutate((d) => toast(d, t === 'dark' ? 'Đã chuyển sang giao diện tối' : 'Đã chuyển sang giao diện sáng'));
  return t;
}

/* ---------- Bước 1 · chọn file, xem trước, thay file ---------- */
const PV_EXT: readonly string[] = ['csv', 'tsv', 'txt', 'xlsx', 'xlsm', 'xls'];
/* lần chọn file mới nhất; kết quả đọc của lần chọn cũ hơn bị bỏ */
let pvToken = 0;

/** Chọn / thả file: kiểm đuôi và dung lượng, rồi đọc nội dung để xem trước (chỉ gọi từ sự kiện trình duyệt). */
let stagedFile: File | null = null;

export function pvStage(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } | undefined): Promise<void> {
  if (!file) { mutate((d) => toast(d, 'Không thấy file nào được thả vào')); return Promise.resolve(); }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!PV_EXT.includes(ext)) { mutate((d) => toast(d, 'Chỉ nhận file CSV hoặc Excel (.csv, .xlsx, .xls)')); return Promise.resolve(); }
  stagedFile = file as File;
  const tk = ++pvToken, big = file.size > 60 * 1048576;
  mutate((d) => {
    d.importErr = null;
    d.pv = { name: file.name, size: file.size, ext, loading: !big, done: false };
    if (big) d.pv.err = 'File lớn hơn 60 MB, không xem trước được.';
    d.pvSheet = 0; d.pvFs = false;
  });
  if (big) return Promise.resolve();
  const done = (patch: Partial<PreviewFile>): void => { if (tk === pvToken) mutate((d) => { if (d.pv) Object.assign(d.pv, castDraft(patch), { loading: false }); }); };
  return file.arrayBuffer().then(pvParse).then(done, (e: unknown) => done({ err: (e instanceof Error && e.message) || 'Không đọc được file này.' }));
}
/** "Đọc file này": gửi file đã xem trước lên máy chủ. */
export function pvGo(): Promise<void> {
  const f = getState().pv;
  if (!f || !f.sheets || !stagedFile || getState().busy) return Promise.resolve();
  return uploadFile(stagedFile);
}
export function pvSetSheet(k: number): void { mutate((d) => { d.pvSheet = k; }); }
export function pvSetFs(open: boolean): void { mutate((d) => { d.pvFs = open && !!d.pv?.sheets; }); }

/** "Thay file khác" (bỏ file đang xem trước) / "Giữ file đang dùng". */
export function setReplaceFile(on: boolean): void {
  if (on) pvToken++;
  mutate((d) => { d.replaceFile = on; d.importErr = null; if (on) { d.pv = null; d.pvSheet = 0; d.pvFs = false; } });
}
/** "Huỷ, chọn file khác" ở màn Đang đọc. */
export function impCancel(): void {
  mutate((d) => { d.importing = null; if (d.pv) d.pv.done = false; toast(d, 'Đã huỷ đọc file'); });
}
export function setImpF(v: AppState['impF']): void { mutate((d) => { d.impF = v; }); }
export function histToggle(): void { mutate((d) => { d.histOpen = !d.histOpen; }); }

/* ---------- màn Nhật ký: lọc loại / người, tìm ---------- */
export function lgSetF(f: string): void { mutate((d) => { d.lgF = f === 'all' ? '' : f; }); }
export function lgSetW(w: string): void { mutate((d) => { d.lgW = w; }); }
export function lgSetQ(q: string): void { mutate((d) => { d.lgQ = q; }); }
export function lgReset(): void { mutate((d) => { d.lgF = ''; d.lgW = ''; }); }

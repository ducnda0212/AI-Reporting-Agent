import type { Row } from '@/types';
import type { AppState, PanelId, ViewId } from '../types';
import { AI_IDS, DEMO, FIELDS, STORAGE, UNASSIGNED } from '@/data/constants';
import { seedCatalog } from '@/data/seed';
import { TOUR } from '@/data/tour';
import { ck, fieldOf, labelBad, selectRows } from '@/lib/cell';
import { draftAi } from '@/lib/ai';
import { applyScenario, restoreRows, SCEN, snapshotRows } from '@/lib/testMode';
import { askAnswer, exAiDraft } from '@/lib/exec';
import { blockers, pendingAI } from '@/lib/selectors';
import { lastCur, snapshot } from '@/lib/versions';
import { SUG_ORPH, chkCols, chkValGroups, sugVal } from '@/lib/check';
import { clone, nowStr } from '@/lib/text';
import { pushLog, setToast } from '../helpers';
import { getState, loadSavedCfg, mutate, writeJson } from '../index';

/** Luồng 4 bước, nhập file, kiểm tra, AI, duyệt, hướng dẫn, chốt & xuất, hệ thống. */

const REDUCED = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const IMPORT_STEPS = ['Đọc file và nhận diện cột', 'Gộp các cột trùng tên', 'Tách mã dự án, ghép vào mẫu 49 cột', 'So với tuần trước và cấu hình đã lưu'];
export const GUIDE_KEY = 'pmo-guide-seen';

/* ---------- điều hướng ---------- */
export function curStep(s: AppState): 1 | 2 | 3 | 4 {
  if (s.modal === 'export') return 4;
  if (s.view === 'import' || !s.loaded) return 1;
  if (s.view === 'check') return 2;
  return 3;
}

export function goStep(n: number) {
  mutate((d) => {
    const k = Math.max(1, Math.min(4, n));
    d.edit = null; d.pop = null; d.menu = null; d.panel = null;
    if (k > 1 && !d.loaded) { setToast(d, 'Chưa có dữ liệu — nhập file ở bước 1 trước'); return; }
    if (k === 1) { d.modal = null; d.view = 'import'; }
    else if (k === 2) { d.modal = null; d.view = 'check'; }
    else if (k === 3) { d.modal = null; d.exported = null; d.view = 'grid'; }
    else { d.view = 'grid'; d.modal = 'export'; }
  });
}

export const setView = (v: ViewId) => mutate((d) => {
  const was = d.view;
  d.view = v; d.modal = null; if (v === 'tlib') d.tlDraft = null;
  if (v === 'tpl' && was !== 'tpl' && !d.panel) d.panel = 'tvcfg';
  if (was === 'tpl' && v !== 'tpl' && v !== 'grid' && d.panel === 'tvcfg') d.panel = null;
});
export const setPanel = (p: PanelId) => mutate((d) => { d.panel = p || null; });
export const setModal = (m: string | null) => mutate((d) => { d.modal = m; d.pop = null; if (!m) { d.exported = null; d.lockMsg = null; } });
export const setMenu = (m: string | null) => mutate((d) => { d.menu = d.menu === m ? null : m; });
export const closeMenu = () => mutate((d) => { d.menu = null; });
export const toast = (m: string) => mutate((d) => setToast(d, m));
export const clearToast = () => mutate((d) => { d.toast = null; });
export type ToggleKey = 'onlyFix' | 'issSkipOpen' | 'aiList' | 'histOpen' | 'replaceFile' | 'infoOpen';
export const toggle = (k: ToggleKey) => mutate((d) => { d[k] = !d[k]; });
export const setSearch = (q: string) => mutate((d) => { d.search = q; });
export const setPop = (id: string | null) => mutate((d) => { d.pop = id; if (id && d.panel === 'issues') d.panel = null; });

export function goFix() {
  mutate((d) => { d.view = 'grid'; d.onlyFix = true; d.modal = null; });
}

export function goGrid(d: AppState) {
  d.view = 'grid'; d.onlyFix = false; d.search = ''; d.collapsed = {}; d.panel = null; delete d.hidden.status;
}

export function gotoCol(fid: string) {
  mutate((d) => {
    delete d.hidden[fid];
    d.view = 'grid'; d.onlyFix = false; d.search = ''; d.collapsed = {};
    d.sel = { i: selectRows(d)[0].i, f: fid }; d.range = null;
    d.scrollReq = { i: selectRows(d)[0].i, f: fid, flash: false };
  });
}

export function exGo(i: number) {
  mutate((d) => { d.view = 'grid'; d.sel = { i, f: 'code' }; d.range = null; d.scrollReq = { i, f: 'code', flash: false }; });
}

export function resetDemo() {
  try { localStorage.removeItem(STORAGE.cfg); localStorage.removeItem(STORAGE.cols); } catch { /* bỏ qua */ }
  location.reload();
}

/* ---------- nhập file ---------- */
function demoFill(d: AppState) {
  if (d.demoFilled) return;
  d.demoFilled = true;
  const logN = d.log.length;
  draftAi(d, d.allRows);
  d.modal = null;
  d.log.splice(0, d.log.length - logN);
  const rows = selectRows(d);
  const pend: Record<number, number> = {};
  const empty: Record<number, number> = {};
  [3, 9, 20].forEach((k) => { if (rows[k]) pend[rows[k].i] = 1; });
  if (rows[5]) empty[rows[5].i] = 1;
  rows.forEach((r) => {
    AI_IDS.forEach((k) => { if (r.ai[k] && !pend[r.i]) r.ai[k]!.ok = true; });
    if (empty[r.i]) { delete r.ai.w3Issues; delete r.ai.w3Plan; }
  });
}

function loadFileNow(name: string) {
  mutate((d) => {
    demoFill(d);
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* bỏ qua */ }
    d.guideOpen = undefined;
    d.fileName = name; d.loaded = true; d.view = 'import'; d.modal = null; d.replaceFile = false; d.loadedAt = nowStr();
    const cfg = loadSavedCfg();
    d.cfgUsed = cfg;
    if (cfg) {
      d.fields.forEach((f) => { if (cfg.src && cfg.src[f.id]) f.src = cfg.src[f.id]; });
      Object.assign(d.statusMap, cfg.status || {});
      Object.assign(d.progMap, cfg.prog || {});
      if (cfg.phase) d.phaseBucket = cfg.phase;
      if (cfg.unsorted) d.unsorted = cfg.unsorted;
      if (cfg.ignore) d.phaseIgnore = cfg.ignore;
      if (cfg.by) d.lockBy = cfg.by;
    }
    pushLog(d, 'Nhập file Jira', name, `${DEMO.fileStats.cols} cột · gộp ${DEMO.fileStats.dupGroups} nhóm cột trùng tên · 2 issue thật + dữ liệu giả lập`, 'Cảnh báo');
  });
}

export function loadFile(name: string, silent = false) {
  if (silent || REDUCED) { loadFileNow(name); return; }
  mutate((d) => { d.importing = { name, step: 0 }; d.view = 'import'; d.modal = null; });
  const tick = () => {
    const imp = getState().importing;
    if (!imp) return;
    if (imp.step + 1 >= IMPORT_STEPS.length) { mutate((d) => { d.importing = null; }); loadFileNow(name); return; }
    mutate((d) => { d.importing!.step++; });
    setTimeout(tick, 420);
  };
  setTimeout(tick, 520);
}

export const replaceFile = (on: boolean) => mutate((d) => { d.replaceFile = on; });
export const toggleGuide = (seen: boolean) => mutate((d) => { d.guideOpen = !(d.guideOpen === undefined ? !seen : d.guideOpen); });

/* ---------- AI soạn nháp ---------- */
function runDrafts(d: AppState) {
  const n = draftAi(d, selectRows(d));
  pushLog(d, 'Gọi AI đọc Progress Report', `${selectRows(d).length} dòng`, `VLLM · ${n} ô nháp (AC, AS, AT), chờ duyệt từng ô`);
  d.modal = n ? 'aiDone' : null;
  if (!n) setToast(d, 'Mọi ô đã có nội dung — không có gì để soạn thêm');
}

export function aiStart() {
  const s = getState();
  if (!s.loaded) { toast('Chưa có dữ liệu — nhập file CSV ở bước 1 trước'); return; }
  if (REDUCED) { mutate(runDrafts); return; }
  const total = selectRows(s).length;
  mutate((d) => { d.aiRun = { n: 0, total }; d.modal = null; });
  const tick = () => {
    const run = getState().aiRun;
    if (!run) return;
    const n = Math.min(run.total, run.n + Math.ceil(run.total / 7));
    mutate((d) => { if (d.aiRun) d.aiRun.n = n; });
    if (n >= run.total) {
      setTimeout(() => {
        mutate((d) => { d.aiRun = null; runDrafts(d); });
        document.body.classList.add('aiflash');
        setTimeout(() => document.body.classList.remove('aiflash'), 1300);
      }, 260);
      return;
    }
    setTimeout(tick, 230);
  };
  setTimeout(tick, 200);
}

/* ---------- duyệt từng ô (spotlight) ---------- */
export function pendingList(d: AppState, onlyKeys?: string[]): string[] {
  const out: string[] = [];
  const rows = selectRows(d);
  [...new Set(rows.map((r) => r.g))].forEach((g) => rows.forEach((r) => {
    if (r.g !== g) return;
    AI_IDS.forEach((fid) => {
      const dr = r.ai[fid];
      const k = ck(r.i, fid);
      if (dr && !dr.ok && (!onlyKeys || onlyKeys.includes(k))) out.push(k);
    });
  }));
  return out;
}

export function startReview(onlyKeys?: string[]) {
  mutate((d) => {
    const list = pendingList(d, onlyKeys);
    if (!list.length) { setToast(d, pendingAI(selectRows(d)) ? 'Không có nháp nào trong vùng chọn' : 'Chưa có nháp chờ duyệt — bấm “Nhờ AI soạn” trước'); return; }
    d.view = 'grid'; d.panel = null; d.modal = null; d.menu = null; d.edit = null;
    d.onlyFix = false; d.search = ''; d.collapsed = {};
    AI_IDS.forEach((fid) => { delete d.hidden[fid]; });
    d.review = { list, pos: 0, done: 0 };
  });
}

function reviewMoveIn(d: AppState, step: number) {
  const rv = d.review;
  if (!rv) return;
  const np = rv.pos + step;
  if (np < 0) return;
  if (np >= rv.list.length) {
    const left = pendingAI(selectRows(d));
    d.review = null;
    pushLog(d, 'Duyệt nội dung AI', rv.done + ' ô', 'Duyệt từng ô trong chế độ tập trung');
    setToast(d, left ? `Đã đi hết danh sách · còn ${left} ô chưa duyệt` : 'Đã duyệt hết nháp AI');
    return;
  }
  rv.pos = np; d.sel = null;
}
export const reviewMove = (step: number) => mutate((d) => reviewMoveIn(d, step));
export const exitReview = () => mutate((d) => { d.review = null; });

export function reviewApprove(text?: string) {
  mutate((d) => {
    const rv = d.review;
    if (!rv) return;
    const [i, fid] = rv.list[rv.pos].split('|');
    const dr = d.allRows[+i].ai[fid];
    if (!dr) { reviewMoveIn(d, 1); return; }
    const v = (text ?? dr.text).trim();
    if (v && v !== dr.text) { dr.text = v; dr.edited = true; }
    if (!dr.ok) { dr.ok = true; rv.done++; }
    reviewMoveIn(d, 1);
  });
}

export function reviewDrop() {
  mutate((d) => {
    const rv = d.review;
    if (!rv) return;
    const [i, fid] = rv.list[rv.pos].split('|');
    const r = d.allRows[+i];
    delete r.ai[fid];
    const f = fieldOf(d, fid);
    pushLog(d, 'Bỏ nháp AI', `${r.code} · ${f.col} ${f.name}`, 'Ô để trống, có thể tự gõ sau');
    reviewMoveIn(d, 1);
  });
}

/** duyệt hàng loạt các dự án đang tick chọn */
export function approveSelectedRows() {
  mutate((d) => {
    const rows = selectRows(d);
    const sr = rows.filter((r) => d.rowSel[r.i]);
    let na = 0;
    sr.forEach((r) => AI_IDS.forEach((k) => { if (r.ai[k] && !r.ai[k]!.ok) { r.ai[k]!.ok = true; na++; } }));
    pushLog(d, 'Duyệt cả dự án', sr.length === rows.length ? `Tất cả ${sr.length} dự án` : sr.map((r) => r.code).join(', '), `${na} ô AI (AC, AS, AT) duyệt một lượt`);
    d.rowSel = {};
    setToast(d, `Đã duyệt ${na} ô của ${sr.length} dự án — vẫn sửa được từng ô trên bảng`);
  });
}

export function reviewSelectedRows() {
  const s = getState();
  const keys: string[] = [];
  selectRows(s).filter((r) => s.rowSel[r.i]).forEach((r) => AI_IDS.forEach((k) => keys.push(ck(r.i, k))));
  mutate((d) => { d.rowSel = {}; });
  startReview(keys);
}

export function byProject() {
  mutate((d) => {
    d.modal = null; d.view = 'grid'; d.onlyFix = false; d.panel = null;
    AI_IDS.forEach((fid) => { delete d.hidden[fid]; });
    setToast(d, 'Tick ô bên trái mỗi dự án (hoặc ô trên cùng để chọn tất cả), rồi bấm “Duyệt … ô của … dự án”');
  });
}

/* ---------- hướng dẫn ---------- */
export function tourGo(n: number) {
  if (n < 0) return;
  if (n < TOUR.length && TOUR[n].load && !getState().loaded) loadFileNow('Jira sample.xlsx');
  mutate((d) => {
    if (n >= TOUR.length) { d.tour = null; try { localStorage.setItem(STORAGE.tour, '1'); } catch { /* bỏ qua */ } return; }
    d.tour = n; d.menu = null; d.modal = null; d.pop = null; d.edit = null;
    TOUR[n].prep?.(d);
  });
}
export function tourEnd() {
  mutate((d) => { d.tour = null; });
  try { localStorage.setItem(STORAGE.tour, '1'); } catch { /* bỏ qua */ }
}

/* ---------- bước 2: ánh xạ cột, quy đổi giá trị, ghép dự án ---------- */
const mapLog = (d: AppState, id: string) => {
  const f = fieldOf(d, id);
  pushLog(d, 'Sửa ánh xạ cột', `${f.col} ${f.name}`, `Nguồn: ${f.src} · áp dụng ${selectRows(d).length} dòng`);
};
export function setFieldSrc(id: string, src: string) {
  mutate((d) => { fieldOf(d, id).src = src; mapLog(d, id); setToast(d, `Đã ánh xạ cột ${fieldOf(d, id).col} “${fieldOf(d, id).name}”`); });
}
export function applyMap(id: string, name: string, src?: string) {
  mutate((d) => {
    const f = fieldOf(d, id);
    if (name.trim()) f.name = name.trim();
    if (src !== undefined) f.src = src;
    pushLog(d, 'Sửa ánh xạ cột', f.name, `Nguồn: ${f.src} · áp dụng ${selectRows(d).length} dòng`);
    d.pop = null;
    setToast(d, `Đã áp dụng ánh xạ cho cột “${f.name}”`);
  });
}
export function toggleRequired(id: string) { mutate((d) => { const f = fieldOf(d, id); f.required = !f.required; }); }
export function unmapCol(id: string) {
  mutate((d) => {
    const f = fieldOf(d, id);
    f.src = FIELDS.find((x) => x.id === id)!.src;
    pushLog(d, 'Hoàn tác ánh xạ cột', `${f.col} ${f.name}`, 'Cột quay về chưa gán');
  });
}
export function autoMapCols() {
  mutate((d) => {
    chkCols(d).forEach((f) => {
      if (f.src === UNASSIGNED) { f.src = 'Custom field (Progress)'; pushLog(d, 'Sửa ánh xạ cột', `${f.col} ${f.name}`, `Nguồn: ${f.src} · tự khớp theo gợi ý`); }
    });
    setToast(d, 'Đã tự khớp theo gợi ý');
  });
}

export function applyValRule(d: AppState, cc: string, vv: string, value: string) {
  if (cc === 'lifecycleStep') {
    const k = parseInt(value, 10);
    if (k) { d.phaseBucket[vv] = k; delete d.phaseIgnore[vv]; } else { d.phaseIgnore[vv] = true; delete d.phaseBucket[vv]; }
    d.unsorted = d.unsorted.filter((x) => x !== vv);
    pushLog(d, 'Sửa rổ gom giá trị', 'AJ · AI Lifecycle', k ? `Gom “${vv}” vào bước ${k}` : `“${vv}” không thuộc bước nào · để trống`);
  } else {
    (cc === 'progress' ? d.progMap : d.statusMap)[vv] = value;
    pushLog(d, 'Sửa rổ gom giá trị', cc === 'progress' ? 'J · Tiến độ' : 'I · Trạng thái', `${vv} → ${value}`);
  }
}
export const setValRule = (cc: string, vv: string, value: string) => mutate((d) => applyValRule(d, cc, vv, value));
export function useSuggestion(cc: string, vv: string) {
  mutate((d) => { const sg = sugVal(cc, vv); if (sg) applyValRule(d, cc, vv, sg); });
}
export function useAllSuggestions(cc: string) {
  mutate((d) => {
    const g = chkValGroups(d, selectRows(d)).find((x) => x.c === cc);
    let n = 0;
    g?.vals.forEach((v) => { const x = sugVal(cc, v); if (x) { applyValRule(d, cc, v, x); n++; } });
    setToast(d, `Đã dùng ${n} đề xuất`);
  });
}
export function undoRule(cc: string, vv: string) {
  mutate((d) => {
    if (cc === 'status') delete d.statusMap[vv];
    else if (cc === 'progress') delete d.progMap[vv];
    else { delete d.phaseBucket[vv]; delete d.phaseIgnore[vv]; if (!d.unsorted.includes(vv)) d.unsorted.push(vv); }
    pushLog(d, 'Hoàn tác quy đổi', vv, 'Giá trị quay về chưa có luật');
  });
}

export function assignOrphan(key: string, value: string) {
  mutate((d) => {
    if (!value) { delete d.orphanDone[key]; return; }
    d.orphanDone[key] = value;
    pushLog(d, 'Ghép issue', key, value === 'Không đưa vào báo cáo' ? 'Bỏ qua, không đưa vào báo cáo' : 'Gán vào dòng ' + value);
  });
}
export function useOrphanSuggestion(key: string) {
  mutate((d) => {
    const to = SUG_ORPH[key];
    d.orphanDone[key] = to;
    pushLog(d, 'Ghép issue', key, to === 'Không đưa vào báo cáo' ? 'Bỏ qua, không đưa vào báo cáo' : `Gán vào dòng ${to} · theo đề xuất`);
  });
}
export function undoOrphan(key: string) { mutate((d) => { delete d.orphanDone[key]; pushLog(d, 'Hoàn tác ghép issue', key, 'Issue quay về chưa ghép'); }); }

export function dupFix(how: 'merge' | 'keep') {
  mutate((d) => {
    d.dupDone = true;
    if (how === 'merge') { d.dupMerged = true; pushLog(d, 'Gộp dòng trùng mã', 'II.D.2.1', 'Bỏ dòng 35 của mẫu'); } else pushLog(d, 'Giữ dòng trùng mã', 'II.D.2.1', 'Dòng 35 để trống');
  });
}
export function newCodes(how: 'added' | 'skipped') {
  mutate((d) => {
    d.newCodes = how;
    if (how === 'added') { pushLog(d, 'Thêm dòng vào bảng', 'I.A.7.1, II.B.2.1', 'Dự án mới · các cột nhập tay còn trống'); setToast(d, 'Đã thêm 2 dòng — nhớ điền Mảng việc, Loại dự án, Market'); }
    else pushLog(d, 'Bỏ qua mã mới', 'I.A.7.1, II.B.2.1', 'Không đưa vào báo cáo tuần này');
  });
}
export const labelOk = () => mutate((d) => { d.labelOk = true; pushLog(d, 'Xác nhận nhóm', selectRows(d).filter(labelBad).map((r) => r.code).join(', '), 'Giữ nhóm theo mã, bỏ qua Labels'); });
export const undoNew = () => mutate((d) => { d.newCodes = 'pending'; pushLog(d, 'Hoàn tác', 'I.A.7.1, II.B.2.1', 'Mã mới quay về chờ quyết định'); });
export const undoDup = () => mutate((d) => { d.dupDone = false; d.dupMerged = false; pushLog(d, 'Hoàn tác', 'II.D.2.1', 'Mã trùng quay về chờ quyết định'); });
export const undoLabel = () => mutate((d) => { d.labelOk = false; pushLog(d, 'Hoàn tác', 'Labels lệch nhóm', 'Quay về chờ quyết định'); });
export const setChk = (k: 'chkTab' | 'chkFlt' | 'chkValCol' | 'chkItem', v: string | null) => mutate((d) => { d[k] = v as never; if (k === 'chkTab') d.view = 'check'; });
export const toggleDone = (n: string) => mutate((d) => { d.showDone[n] = !d.showDone[n]; });

/* ---------- rổ gom ---------- */
export const openBuckets = (col: string) => mutate((d) => { d.pop = null; d.bucketCol = col; d.modal = 'buckets'; d.pickedVal = null; });
export const setBucketCol = (col: string) => mutate((d) => { d.bucketCol = col; d.pickedVal = null; });
export const pickValue = (v: string) => mutate((d) => { d.pickedVal = v; });
export function dropPhase(k: number) {
  mutate((d) => {
    if (!d.pickedVal) { setToast(d, 'Chọn một giá trị bên trái trước'); return; }
    d.phaseBucket[d.pickedVal] = k;
    d.unsorted = d.unsorted.filter((v) => v !== d.pickedVal);
    pushLog(d, 'Sửa rổ gom giá trị', 'AJ · AI Lifecycle', `Gom “${d.pickedVal}” vào giai đoạn ${k}`);
    d.pickedVal = null;
  });
}
export function dropStatus(t: string, unsortedNow: string[]) {
  mutate((d) => {
    const isTD = d.bucketCol === 'progress';
    if (!d.pickedVal || !unsortedNow.includes(d.pickedVal)) { setToast(d, 'Chọn một giá trị bên trái trước'); return; }
    (isTD ? d.progMap : d.statusMap)[d.pickedVal] = t;
    pushLog(d, 'Sửa rổ gom giá trị', isTD ? 'J · Tiến độ' : 'I · Trạng thái', `${d.pickedVal} → ${t} · cột AA tự tính lại`);
    d.pickedVal = null;
  });
}

/* ---------- cảnh báo / dự án / ghi chú / hỏi AI ---------- */
export const dismissIssue = (key: string, title: string) => mutate((d) => { d.issDis[key] = true; pushLog(d, 'Bỏ qua cảnh báo', title, 'Ẩn trong tuần này'); setToast(d, 'Đã bỏ qua — xem lại ở mục “Đã bỏ qua”'); });
export const restoreIssue = (key: string) => mutate((d) => { delete d.issDis[key]; });
export const setIssFlt = (v: string) => mutate((d) => { d.issFlt = v; });
export const openProject = (i: number) => mutate((d) => { d.panel = 'project'; d.panelRow = i; d.stage = 7; });
export const setStage = (k: number) => mutate((d) => { d.stage = k; });
export function saveStage(state: string, why: string) {
  mutate((d) => {
    if (!why.trim()) { setToast(d, 'Phải ghi lý do trước khi lưu'); return; }
    const r = d.allRows[d.panelRow!];
    r.stages[d.stage] = state as Row['stages'][number];
    r.reasons[d.stage] = why.trim();
    pushLog(d, 'Sửa ô', `${r.code} · Giai đoạn ${d.stage + 1}`, `Trạng thái mới, có ghi lý do ${why.trim().length} ký tự`);
    setToast(d, 'Đã lưu, lý do sẽ đi kèm vào cột Note khi xuất');
  });
}
export function addNote(code: string, text: string) {
  mutate((d) => {
    if (!text.trim()) { setToast(d, 'Nhập nội dung ghi chú'); return; }
    const t = new Date();
    d.notes.unshift({ code, by: d.lockBy || 'Bạn', at: `${t.getDate()}/${t.getMonth() + 1} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, text: text.trim(), done: false });
    pushLog(d, 'Thêm ghi chú', code, text.trim().slice(0, 60));
  });
}
export const toggleNote = (k: number) => mutate((d) => { d.notes[k].done = !d.notes[k].done; });
export function ask(q: string) {
  if (!q.trim()) return;
  mutate((d) => { d.askLog.push({ q, a: askAnswer(d, q) }); pushLog(d, 'Hỏi AI', q, ''); });
}
export const setPanelFor = (p: PanelId) => setPanel(p);

/* ---------- chốt & xuất ---------- */
export function doLock(by: string, note: string) {
  mutate((d) => {
    if (!by.trim()) { d.lockMsg = 'Gõ tên người chốt trước.'; return; }
    const rows = selectRows(d);
    if (blockers(d, rows).length) return;
    const lc = lastCur(d);
    const snap = snapshot(d);
    const nv = (lc ? lc.v : 0) + 1;
    let hand = 0; let aiOk = 0;
    rows.forEach((r) => { hand += Object.keys(r.ovr).length; AI_IDS.forEach((k) => { if (r.ai[k] && r.ai[k]!.ok) aiOk++; }); });
    d.versions.unshift({ wk: 'w3', v: nv, by: by.trim(), at: nowStr(), note: note.trim(), exported: '', snap, stats: { rows: rows.length, hand, ai: aiOk }, changes: [] });
    d.lockBy = by.trim(); d.lockMsg = null; d.verSel = `w3|${nv}`;
    pushLog(d, 'Chốt bản', `Tuần 3/11 · v${nv}`, by.trim() + (note ? ' · ' + note : '') + ` · ${rows.length} dự án`);
    setToast(d, `Đã chốt bản v${nv} — giờ có thể xuất file`);
  });
}
export const pickVersion = (k: string) => mutate((d) => { d.verSel = k; });
export const reExport = (k: string) => mutate((d) => { pushLog(d, 'Tải lại file đã xuất', k.replace('|', ' · v'), 'Lấy đúng file của bản đã chốt'); setToast(d, 'Bản thử: file đã xuất được tải lại từ bản đã chốt'); });
export const setExOut = (k: 'f49' | 'exec', v: boolean) => mutate((d) => { d.exOut[k] = v; });
export const setExFmt = (v: string) => mutate((d) => { d.exFmt = v; });
export const switchWeek = (wk: string) => mutate((d) => {
  d.menu = null;
  if (wk === 'w3') return;
  const vv = d.versions.find((v) => v.wk === wk);
  d.view = 'ver'; d.verSel = vv ? `${vv.wk}|${vv.v}` : null;
  setToast(d, `Tuần đã chốt chỉ xem, không sửa — đang mở bản v${vv ? vv.v : 1}`);
});

export function markExported(fn: string, formatLabel: string): string | null {
  let out: string | null = null;
  mutate((d) => {
    d.doneExport = true;
    if (!d.exOut.f49 && !d.exOut.exec) { setToast(d, 'Chọn ít nhất một file để xuất'); return; }
    out = [d.exOut.f49 ? fn || 'bao-cao.xlsx' : '', d.exOut.exec ? '20261121_DAN_Bao-cao-dieu-hanh.' + formatLabel : ''].filter(Boolean).join(' · ');
    d.exported = out;
    const lc = lastCur(d);
    if (lc) lc.exported = out;
    const nf = Object.keys(d.fmt).length;
    pushLog(d, 'Xuất báo cáo', out, `Từ bản v${lc ? lc.v : '?'} · ${selectRows(d).length} dòng · 49 cột · chỉ ghi khối Tuần 3/11 (AR–AT)` + (nf ? ` · giữ định dạng ${nf} ô` : '') + ' · cột ẩn trên màn hình vẫn được xuất');
  });
  return out;
}

/* ---------- báo cáo điều hành ---------- */
export function runExAiDraft() {
  mutate((d) => {
    const { nk, nc } = exAiDraft(d);
    pushLog(d, 'AI soạn phần điều hành', 'Báo cáo điều hành', `${nk} kết quả KPI · ${nc} ý kiến cần chỉ đạo · nhận xét chung`, 'AI');
    setToast(d, `AI đã soạn nháp ${nk + nc + 1} ô — duyệt từng ô (nền tím) trước khi xuất`);
  });
}
export function setExDraft(k: 'kpiResult' | 'directive' | 'note', code: string | null, text: string, approve = true) {
  mutate((d) => {
    if (k === 'note') { d.exNote = { text, ok: approve, why: d.exNote?.why }; return; }
    const e = (d.ex[code!] = d.ex[code!] || { hl: true });
    e[k] = { text, ok: approve, why: e[k]?.why || 'người dùng nhập' };
    pushLog(d, 'Sửa báo cáo điều hành', `${code} · ${k === 'kpiResult' ? 'Kết quả KPI' : 'Ý kiến cần chỉ đạo'}`, text ? 'Lưu và duyệt' : 'Xoá nội dung');
  });
}
export function approveExDraft(k: 'kpiResult' | 'directive' | 'note', code: string | null, text: string) {
  mutate((d) => {
    const dr = k === 'note' ? d.exNote : d.ex[code!]?.[k];
    if (!dr) return;
    dr.text = text.trim(); dr.ok = true;
    pushLog(d, 'Duyệt nháp AI', k === 'note' ? 'Nhận xét chung' : `${code} · ${k === 'kpiResult' ? 'Kết quả KPI' : 'Ý kiến cần chỉ đạo'}`, 'Báo cáo điều hành');
  });
}
export const setExHl = (code: string, on: boolean) => mutate((d) => { (d.ex[code] = d.ex[code] || { hl: true }).hl = on; });
export const addExDirective = (code: string) => mutate((d) => { (d.ex[code] = d.ex[code] || { hl: true }).directive = { text: '', ok: true, why: 'người dùng nhập' }; });

/* ---------- chế độ test ---------- */
let testOrig: ReturnType<typeof snapshotRows> | null = null;
export function enterTest(sc: string) {
  mutate((d) => {
    if (!testOrig) testOrig = snapshotRows(d.allRows);
    restoreRows(d.allRows, testOrig);
    d.test = sc; d.testSeed = d.testSeed || 7; d.menu = null; d.pe = null;
    applyScenario(d.allRows, sc, d.testSeed);
    pushLog(d, 'Chế độ test', SCEN[sc].name, 'Dữ liệu giả — không ảnh hưởng dữ liệu thật');
    setToast(d, 'Chế độ test · ' + SCEN[sc].name);
  });
}
export function reseedTest() { const sc = getState().test; if (!sc) return; mutate((d) => { d.testSeed = (d.testSeed || 7) + 1; }); enterTest(sc); }
export function exitTest() {
  mutate((d) => {
    if (testOrig) restoreRows(d.allRows, testOrig);
    d.test = null; d.pe = null; d.menu = null;
    pushLog(d, 'Thoát chế độ test', '', 'Khôi phục dữ liệu demo');
    setToast(d, 'Đã thoát chế độ test');
  });
}
export const setCleanIdx = (delta: number) => mutate((d) => { d.cleanIdx = Math.max(0, d.cleanIdx + delta); });

/* ---------- hệ thống (catalog) ---------- */
export { seedCatalog, clone, writeJson };

export const cancelImport = () => mutate((d) => { d.importing = null; setToast(d, 'Đã huỷ đọc file'); });
export const openVersions = () => mutate((d) => { d.menu = null; d.view = 'ver'; });

import { createStore, useStore as useZustandStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { FIELDS, BASE_PHASE_BUCKET, BASE_PROG_MAP, BASE_STATUS_MAP, PHASE_UNSORTED, STORAGE } from '@/data/constants';
import { SEED_TPLS } from '@/data/templates';
import { SEED_VERSIONS, seedCatalog, seedRows } from '@/data/seed';
import { clone } from '@/lib/text';
import type { AppState, FileCfg } from './types';

/* ---------- đọc/ghi localStorage (mọi truy cập đều bọc try/catch) ---------- */
export function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null; } catch { return null; }
}
export function writeJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* bỏ qua: trình duyệt chặn lưu */ }
}

interface SavedCat { sys: AppState['cat']; run: AppState['catRun']; reqs?: AppState['reqs']; pend?: number; runAt?: string | null }

function createInitialState(): AppState {
  const allRows = seedRows();
  const savedCat = readJson<SavedCat>(STORAGE.cat);
  const hasCat = !!(savedCat && savedCat.sys && savedCat.run);
  const cols = readJson<{ hidden?: Record<string, boolean>; pin?: boolean }>(STORAGE.cols);
  const cat = hasCat ? savedCat!.sys : seedCatalog(allRows);
  let tour: number | null = null;
  try { if (!localStorage.getItem(STORAGE.tour)) tour = 0; } catch { /* bỏ qua */ }

  return {
    allRows,
    fields: clone(FIELDS),
    statusMap: clone(BASE_STATUS_MAP),
    progMap: clone(BASE_PROG_MAP),
    phaseBucket: clone(BASE_PHASE_BUCKET),
    unsorted: PHASE_UNSORTED.slice(),
    phaseIgnore: {},
    cat,
    catRun: hasCat ? savedCat!.run : clone(cat),
    catPend: hasCat ? savedCat!.pend || 0 : 0,
    catRunAt: hasCat ? savedCat!.runAt || null : 'lần nạp đầu',
    reqs: hasCat ? savedCat!.reqs || [] : [],
    versions: SEED_VERSIONS.slice(),
    log: [],
    notes: [
      { code: 'I.A.4.2', by: 'Tuấn', at: '15/11 09:40', text: 'PIC đổi sang Mai Linh từ tuần này — đã gửi yêu cầu sửa lên hệ thống, chờ chạy lại.', done: false },
      { code: 'I.C.1.4', by: 'Khuê', at: '14/11 17:05', text: 'Hỏi lại team về rủi ro dữ liệu GPS trước khi ghi AC = Cao.', done: true },
    ],
    askLog: [],
    aiList: false,
    rid: { sel: 'RI-01', flt: 'all', decisions: {}, edit: null },

    view: 'import', loaded: false, importing: null, replaceFile: false, histOpen: false, cfgUsed: null,
    newCodes: 'pending', labelOk: true, dupDone: true, dupMerged: false, orphanDone: {},
    chkTab: null, chkFlt: 'all', chkValCol: null, chkItem: null, showDone: {},
    infoOpen: false,

    sel: null, scrollReq: null, range: null, edit: null, rowSel: {}, search: '', onlyFix: false, collapsed: {},
    hidden: cols && cols.hidden ? cols.hidden : { x: true, workstream: true },
    pinTask: cols ? cols.pin !== false : true,
    fmt: {}, wrap: {}, colFilter: {}, sort: null, fpop: null, ctx: null, menu: null,
    find: { open: false, q: '', cs: false, whole: false, scope: 'all', all: false, filter: false, idx: -1 },
    pe: null, peAuto: true,

    panel: null, panelRow: null, stage: 7, modal: null, pop: null, bucketCol: 'lifecycleStep', pickedVal: null,
    issDis: {}, issFlt: 'all', issSkipOpen: false,

    aiRun: null, review: null, tour, demoFilled: false,

    lockBy: 'Khuê', lockMsg: null, verSel: null, exported: null, doneExport: false,
    exOut: { f49: true, exec: true }, exFmt: 'pdf', exNote: null, ex: {},

    catTab: 'proj', catQ: '', catAdmin: false, reqForm: null,

    tpls: clone(SEED_TPLS), tlFlt: 'all', tlQ: '', tlDraft: null, tpK: '', tpMiss: false, tpQ: '',

    test: null, testSeed: 7, cleanIdx: 0,

    toast: null,
  };
}

/** Store gốc (dùng cho action / test) và hook React bọc quanh nó. */
export const store = createStore<AppState>()(immer(() => createInitialState()));
export const useStore = Object.assign(<T,>(selector: (s: AppState) => T) => useZustandStore(store, selector), store);

/** Ghi kiểu `recipe` (immer) — dùng cho mọi action. */
export const mutate = (recipe: (d: AppState) => void) => useStore.setState(recipe);
export const getState = () => useStore.getState();

/* ---------- lưu bền vững: cột hiển thị, hệ thống, cấu hình quy đổi ---------- */
export function loadSavedCfg(): FileCfg | null {
  return readJson<FileCfg>(STORAGE.cfg);
}

useStore.subscribe((s, prev) => {
  if (s.hidden !== prev.hidden || s.pinTask !== prev.pinTask) writeJson(STORAGE.cols, { hidden: s.hidden, pin: s.pinTask });
  if (s.cat !== prev.cat || s.catRun !== prev.catRun || s.reqs !== prev.reqs || s.catPend !== prev.catPend || s.catRunAt !== prev.catRunAt) {
    writeJson(STORAGE.cat, { sys: s.cat, run: s.catRun, reqs: s.reqs, pend: s.catPend, runAt: s.catRunAt });
  }
  if (s.loaded && (s.fields !== prev.fields || s.statusMap !== prev.statusMap || s.progMap !== prev.progMap
    || s.phaseBucket !== prev.phaseBucket || s.unsorted !== prev.unsorted || s.phaseIgnore !== prev.phaseIgnore || s.lockBy !== prev.lockBy)) {
    const src: Record<string, string> = {};
    s.fields.forEach((f) => { if (f.kind === 'jira' || f.kind === 'bucket') src[f.id] = f.src; });
    const cfg: FileCfg = {
      at: new Date().toLocaleString('vi-VN'), src, status: s.statusMap, prog: s.progMap,
      phase: s.phaseBucket, unsorted: s.unsorted, ignore: s.phaseIgnore, by: s.lockBy,
    };
    writeJson(STORAGE.cfg, cfg);
  }
});

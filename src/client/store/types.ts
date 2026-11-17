import type { Catalog, Field, LogEntry, Row, Version } from '@/types';
import type { AskResult } from '@/lib/exec';

export type ViewId = 'import' | 'check' | 'grid' | 'exec' | 'cat' | 'log' | 'tpl' | 'ver';
export type PanelId = 'issues' | 'rev' | 'ask' | 'note' | 'ai' | 'project' | null;

export interface Sel { i: number; f: string }
export interface Range { a: Sel; b: Sel }

export interface FindState {
  open: boolean; q: string; cs: boolean; whole: boolean; scope: 'all' | 'week' | 'col';
  all: boolean; filter: boolean; idx: number;
}

export interface PeState { i: number; f: string; val: string; orig: string; raw: boolean; auto: boolean }

export interface CellFmt { b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string; fill?: string }

export interface ReviewState { list: string[]; pos: number; done: number }

export interface FilterPop { f: string; q: string; pick: Record<string, boolean> }
export interface CtxMenu { x: number; y: number; i: number; f: string }

export interface Note { code: string; by: string; at: string; text: string; done: boolean }

export interface SysRequest {
  id: number; code: string; type: 'new' | 'edit'; at: string; by: string; reason: string;
  status: 'pending' | 'done' | 'rejected'; run?: boolean;
  task?: string; g?: string; pic?: string; field?: string; from?: string; to?: string;
}

export interface ReqForm {
  type: 'new' | 'edit'; code: string; task?: string; g?: string; field?: string; to?: string; reason?: string;
}

export interface ExDraft { text: string; ok: boolean; why?: string }
export interface ExRow { hl: boolean; kpiResult?: ExDraft; yk?: ExDraft; directive?: ExDraft; [k: string]: unknown }

export interface FileCfg {
  at: string; src: Record<string, string>; status: Record<string, string>; prog: Record<string, string>;
  phase: Record<string, number>; unsorted: string[]; ignore: Record<string, boolean>; by: string;
}

export interface AppState {
  /* ---- dữ liệu ---- */
  allRows: Row[];
  fields: Field[];
  statusMap: Record<string, string>;
  progMap: Record<string, string>;
  phaseBucket: Record<string, number>;
  unsorted: string[];
  phaseIgnore: Record<string, boolean>;
  cat: Catalog;
  catRun: Catalog;
  catPend: number;
  catRunAt: string | null;
  reqs: SysRequest[];
  versions: Version[];
  log: LogEntry[];
  notes: Note[];
  askLog: Array<{ q: string; a: AskResult }>;
  aiList: boolean;

  /* ---- luồng ---- */
  view: ViewId;
  loaded: boolean;
  fileName?: string;
  loadedAt?: string;
  importing: { name: string; step: number } | null;
  replaceFile: boolean;
  histOpen: boolean;
  guideOpen?: boolean;
  cfgUsed: FileCfg | null;
  newCodes: 'pending' | 'added' | 'skipped';
  labelOk: boolean;
  dupDone: boolean;
  dupMerged: boolean;
  orphanDone: Record<string, string>;
  chkTab: string | null;
  chkFlt: string;
  chkValCol: string | null;
  chkItem: string | null;
  showDone: Record<string, boolean>;
  infoOpen: boolean;

  /* ---- bảng ---- */
  sel: Sel | null;
  /** yêu cầu cuộn bảng tới ô; `flash`: nháy sáng ô (kết quả tìm / nhảy tới địa chỉ) */
  scrollReq: { i: number; f: string; flash: boolean } | null;
  range: Range | null;
  edit: Sel | null;
  rowSel: Record<number, boolean>;
  search: string;
  onlyFix: boolean;
  collapsed: Record<string, boolean>;
  hidden: Record<string, boolean>;
  pinTask: boolean;
  fmt: Record<string, CellFmt>;
  wrap: Record<string, boolean>;
  colFilter: Record<string, Record<string, number>>;
  sort: { f: string; dir: number } | null;
  fpop: FilterPop | null;
  ctx: CtxMenu | null;
  menu: string | null;
  find: FindState;
  pe: PeState | null;
  peAuto: boolean;

  /* ---- panel / modal ---- */
  panel: PanelId;
  panelRow: number | null;
  stage: number;
  modal: string | null;
  pop: string | null;
  bucketCol: string;
  pickedVal: string | null;
  issDis: Record<string, boolean>;
  issFlt: string;
  issSkipOpen: boolean;

  /* ---- AI / duyệt / hướng dẫn ---- */
  aiRun: { n: number; total: number } | null;
  review: ReviewState | null;
  tour: number | null;
  demoFilled: boolean;

  /* ---- chốt & xuất ---- */
  lockBy: string;
  lockMsg: string | null;
  verSel: string | null;
  exported: string | null;
  doneExport: boolean;
  exOut: { f49: boolean; exec: boolean };
  exFmt: string;
  exNote: ExDraft | null;
  ex: Record<string, ExRow>;

  /* ---- hệ thống (catalog) ---- */
  catTab: string;
  catQ: string;
  catAdmin: boolean;
  reqForm: ReqForm | null;

  /* ---- chế độ test ---- */
  test: string | null;
  testSeed: number;
  cleanIdx: number;

  toast: string | null;
}

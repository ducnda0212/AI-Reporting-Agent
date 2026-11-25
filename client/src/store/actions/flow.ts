/* Luồng 3 bước (Nhập file → Điền & duyệt → Chốt & xuất), nạp dữ liệu GOLD, chế độ dữ liệu thử, chuyển màn.
   Port từ prototype v4: buildRow, seedCatalog/orgInfo, loadFileNow, enterTest/exitTest, pfApply (lớp cuối), goStep, navGo. */
import { castDraft, type Draft } from 'immer';
import demoData from '@/data/demo.json';
import { AI_IDS, FIELDS, PHASE_BUCKET, PROG_MAP, SCEN, STATUS_MAP } from '@/data/constants';
import { aiDrafts } from '@/lib/ai';
import { cellValue, mapNorm, type CellCtx } from '@/lib/cell';
import { cleanComment, cleanKpi, cleanText } from '@/lib/clean';
import { toggleTheme, type Theme } from '@/lib/theme';
import { pvParse } from '@/lib/xlsx';
import type { AiFieldId, AppState, ModalType, PanelType, PreviewFile, Row, TestScenario, ViewType, WeekReport } from '@/types';
import { dropRowSession, getState, inBrowser, log, lsGet, lsSet, LS, mutate, rowsOf, toast } from '@/store';
import { startTour } from './help';

/* ---------- dữ liệu nguồn: DEMO gộp GOLD như prototype L3235-3238 ---------- */
const GOLD = demoData.gold, DEMO = demoData.demo;
type Gold = (typeof GOLD.rows)[number];
export const GOLD_FILE = GOLD.file;
export const FILE_STATS = { ...DEMO.fileStats, ...GOLD.stats };
const MANG: Record<string, string> = { ...GOLD.mang, ...DEMO.mang };
/* phase "chưa xếp bước" có trong file (GOLD không có) */
export const PHASE_UNSORTED: string[] = ['TBD', '99. Chờ bổ sung'].filter((v) => GOLD.rows.some((r) => r.rawPhase === v));
export const IMPORT_STEPS: readonly string[] = ['Đọc file và nhận diện 277 cột', 'Gộp 14 nhóm cột trùng tên', 'Tách mã dự án, ghép vào 49 cột mẫu', 'So với tuần trước và cấu hình đã lưu'];

/* dữ liệu bản chốt tuần trước (giả lập) cho các cột nhập tay */
const NAMES2 = ['Trần Minh', 'Phan Ngọc', 'Lý Phương', 'Đặng Quân', 'Hồ Ruby', 'Tạ Sơn', 'Lâm Thảo', 'Vũ Hải'];
const DOM2: Record<string, string> = { 'I.A': 'Food', 'I.C': 'Ride', 'II.A': 'Driver', 'II.B': 'Fleet', 'II.D': 'Platform', 'II.E': 'Platform', 'II.I': 'Platform' };
const PHONG_OF: Record<string, string> = { 'I.A': 'P. AI Food & Express', 'I.C': 'P. AI Ride', 'II.A': 'P. AI Tài xế', 'II.B': 'P. AI Phương tiện', 'II.D': 'P. Nền tảng & Quản trị', 'II.E': 'P. MLOps', 'II.I': 'P. Công cụ MOC' };
const CTX0: CellCtx = { phaseBucket: PHASE_BUCKET };

type Text = Record<string, string | undefined>;
const txt = (r: Row): Text => r as unknown as Text;

function buildRow(d: Gold, i: number): Row {
  const step = PHASE_BUCKET[d.rawPhase] || parseInt(d.rawPhase, 10) || 2;
  const x = d as Gold & { isNew?: boolean; assigneeIdOnly?: boolean };
  const r: Row = {
    i, ma: d.ma, viec: d.viec, key: d.key, g: d.g, real: d.real, dup: d.dup, isNew: !!x.isNew, tplRow: d.row,
    rawStatus: d.rawStatus, rawProgress: d.rawProgress, rawPhase: d.rawPhase, labels: d.labels,
    jira: { pic: d.assignees[0] || '', po: d.assignees[1] || '', gdk: d.real ? d.teamName || '' : d.g.indexOf('II') === 0 ? 'QLTT Khối 2' : 'QLTT Khối 1' },
    pic: d.assignees[0] || '', po: d.assignees[1] || '', tl: d.assignees[2] || d.tl || '', poField: d.po || '', idOnly: !!x.assigneeIdOnly,
    kpi: d.kpi, muctieu: d.muctieu, milestone: d.milestone, start: d.start, end: d.end, gdk: d.teamName, phong: '',
    pr: d.pr as WeekReport[], prw: d.prw as Row['prw'], comment: d.comment, updated: d.updated, tags: [],
    done: step, total: 12, reasons: {}, ai: {}, ovr: {},
    stages: Array.from({ length: 12 }, (_x, k) => (k < step - 2 ? 'done' : k < step ? 'doing' : 'todo'))
  };
  const w = r.prw, t = (d.tpl || {}) as Text, prev = !r.isNew, j = i, top = r.g.split('.').slice(0, 2).join('.');
  Object.assign(r, {
    w1ht: w.w1 ? w.w1.done : '', w1kh: w.w1 ? w.w1.plan : '', w2ht: w.w2 ? w.w2.done : '', w2kh: w.w2 ? w.w2.plan : '',
    ht: w.w3 ? w.w3.done : w.w2 ? 'Tiếp tục theo kế hoạch tuần trước: ' + (w.w2.plan || w.w2.done || '').split('\n')[0] : 'Chưa có Progress Report trong tuần này',
    giatri: t.AB || (prev ? ['Trung bình', 'Cao', 'Thấp'][j % 3] : 'Trung bình'),
    action: t.AD || (prev ? (r.rawStatus === 'DONE' ? 'Đã đóng' : r.rawStatus === 'PENDING' ? 'Tạm dừng' : 'Đi tiếp') : ''),
    nextstep: t.AE || (prev && j % 3 === 1 ? 'Mở rộng Quy mô (Scale)' : ''),
    loai: t.AF || (prev ? 'KHHĐ 2026' : ''),
    market: prev ? ['VN', 'VN', 'Indo', 'VN', 'Malay', 'VN', 'Toàn khu vực'][j % 7] : '',
    domain: prev ? DOM2[top] || 'Platform' : '',
    link: prev ? 'confluence/pmo/' + r.ma : '',
    bo: prev ? NAMES2[(j + 1) % 8] : '', tp: prev ? 'TP ' + NAMES2[j % 8] : '', aieng: prev ? NAMES2[(j + 2) % 8] : '',
    airs: prev && j % 3 === 1 ? NAMES2[(j + 5) % 8] : '', mlops: prev ? NAMES2[(j + 6) % 8] : '',
    swe: prev && j % 4 !== 3 ? NAMES2[(j + 1) % 8] + ' (BE)' : '',
    caitien: prev ? (j % 3 === 0 ? 'Cải tiến' : 'Xây mới') : '', prio: prev ? 'P' + (1 + (j % 3)) : '',
    uoctinh: prev && j % 6 === 0 ? 'Tiết kiệm ~1,2 tỷ/năm (ước tính)' : '', output: '',
    w1vd: prev ? (j % 4 === 0 ? 'Thiếu dữ liệu nhãn, đề xuất bổ sung' : 'Không có') : t.AN || '',
    w2vd: prev ? (r.rawProgress === 'Off-track' ? 'Chậm tiến độ, đề xuất chốt lại mốc' : 'Không có') : ''
  });
  if (t.AL) r.w1ht = t.AL;
  if (t.AM) r.w1kh = t.AM;
  if (t.AN) r.w1vd = t.AN;
  if (t.C && !d.real) r.viec = t.C;
  if (t.D && !d.real) r.muctieu = t.D;
  if (t.F && !d.real) r.pic = t.F;
  return r;
}

/* ---------- cột hệ thống (cfg): danh mục dự án/đơn vị dựng từ dòng (seedCatalog), vá theo file thật (pfApply realOnly),
   ô còn trống lấy giá trị dòng khác; ghi thẳng lên dòng vì lib/cell đọc `r[f.id]` ---------- */
const UNIT_IDS: readonly string[] = ['gdk', 'phong', 'tp'];
const CFG_IDS = FIELDS.filter((f) => f.kind === 'cfg').map((f) => f.id);

function applyCatalogue(rows: Row[]): void {
  const units: Record<string, Text> = {}, projects: Record<string, Text> = {};
  let nu = 0;
  rows.forEach((r, j) => {
    if (r.isNew) return;
    const top = r.g.split('.').slice(0, 2).join('.');
    if (!units[r.g]) units[r.g] = { name: MANG[r.g] || r.g, gdk: r.jira.gdk || (top.indexOf('II') === 0 ? 'QLTT Khối 2' : 'QLTT Khối 1'), phong: PHONG_OF[top] || '', tp: NAMES2[(nu++ * 3) % 8] };
    if (projects[r.ma]) return;
    projects[r.ma] = {
      g: r.g, viec: r.viec, muctieu: r.muctieu || '', kpi: r.kpi || '', pic: r.jira.pic || NAMES2[(j + 3) % 8], start: r.start || '', end: r.end || '',
      bo: r.bo || NAMES2[(j + 1) % 8], po: r.jira.po || NAMES2[(j + 4) % 8], aieng: r.aieng || '', airs: r.airs || '', mlops: r.mlops || '', swe: (r.swe || '').replace(' (BE)', '')
    };
  });
  Object.keys(units).forEach((g) => {
    const cnt: Record<string, number> = {};
    rows.forEach((r) => { if (r.g === g && r.jira.gdk) cnt[r.jira.gdk] = (cnt[r.jira.gdk] || 0) + 1; });
    const best = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0];
    if (best) units[g].gdk = best;
  });
  const real = rows.filter((r) => r.real);
  real.forEach((r) => {
    const P = (projects[r.ma] ||= { g: r.g });
    P.viec = r.viec;
    if (r.muctieu) P.muctieu = r.muctieu;
    if (r.kpi) P.kpi = r.kpi;
    if (r.start) P.start = r.start;
    if (r.end) P.end = r.end;
    if (r.po) P.po = r.po.replace(/\s*\(.*\)\s*$/, '');
  });
  const val = (r: Row, id: string): string | null => {
    const p = projects[r.ma], u = units[p ? p.g! : r.g];
    if (!p) {
      if (id === 'viec') return r.viec || null;
      if (id === 'mang' && u) return u.name || null;
      return (UNIT_IDS.includes(id) && u && u[id]) || null;
    }
    return (id === 'mang' ? (u ? u.name : p.g) : UNIT_IDS.includes(id) ? u && u[id] : p[id]) || null;
  };
  real.forEach((r) => CFG_IDS.forEach((id) => {
    if (val(r, id) !== null) return;
    const donor = rows.find((x) => x !== r && val(x, id) !== null);
    if (!donor) return;
    const dv = val(donor, id)!;
    if (UNIT_IDS.includes(id)) { const u = (units[r.g] ||= { name: r.g }); u[id] ||= dv; }
    else { const p = (projects[r.ma] ||= { g: r.g, viec: r.viec }); p[id] ||= dv; }
  }));
  rows.forEach((r) => CFG_IDS.forEach((id) => {
    const v = val(r, id);
    if (id === 'viec' || id === 'pic' || id === 'po') txt(r)[id] = v || '';
    else if (v === null) delete txt(r)[id];
    else txt(r)[id] = v;
  }));
}

/** Dòng như lúc vừa đọc file (chưa có nháp AI) — gốc của mọi kịch bản. */
export function baseRows(): Row[] {
  const rows = GOLD.rows.map(buildRow);
  rows.forEach((r) => { if (r.ma === 'I.A.4.1') { r.stages[7] = 'miss'; r.stages[9] = 'miss'; } });
  applyCatalogue(rows);
  return rows;
}

function addDrafts(all: Row[], vis: Row[], ctx: CellCtx): void {
  aiDrafts(vis, ctx).forEach((x) => { all[x.i].ai[x.f] = x.d; });
}

/** Bảng sau khi nhập file thật: mỗi dòng có nháp AI ở AC/AS/AT, tất cả chờ duyệt. */
function loadedRows(): Row[] {
  const rows = baseRows();
  addDrafts(rows, rows.filter((r) => r.real), CTX0);
  return rows;
}

/* ---------- Bước 1 · nhập file ---------- */
export function loadFileNow(name: string): void {
  mutate((d) => {
    d.allRows = castDraft(loadedRows());
    d.realOnly = true; d.test = null; d.testOrig = null;
    d.newCodes = 'added'; d.dupMerged = true; d.phaseBucket = { ...PHASE_BUCKET }; d.unsorted = [...PHASE_UNSORTED];
    dropRowSession(d); d.fileName = name; d.loaded = true; d.view = 'import'; d.modal = null; d.importing = null; d.replaceFile = false;
    const S = FILE_STATS;
    log(d, 'Nhập file Jira', name, S.cols + ' cột · gộp ' + S.dupGroups + ' nhóm cột trùng tên · ' + S.epics + ' epic dự án · ' + S.tasks + ' task con không đưa vào báo cáo', 'Cảnh báo');
  }, { resetUndo: true });
}

/** Bước tour cần bảng mà chưa có file: nạp file mẫu rồi ở lại màn Bảng (prep goGrid của prototype). */
export function loadSampleForTour(): void { loadFileNow(GOLD_FILE); mutate((d) => { d.view = 'grid'; }); }

const reducedMotion = (): boolean => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Nhập file có màn "Đang đọc" (từng bước 200ms) trên trình duyệt; `silent`/node/giảm chuyển động thì nạp ngay. */
export function loadFile(name: string, silent = false): void {
  if (silent || !inBrowser() || reducedMotion()) return loadFileNow(name);
  mutate((d) => { d.importing = { name, step: 0 }; d.view = 'import'; d.modal = null; });
  const tick = (): void => {
    const im = getState().importing;
    if (!im) return;
    if (im.step + 1 >= IMPORT_STEPS.length) return loadFileNow(name);
    mutate((d) => { if (d.importing) d.importing.step++; });
    setTimeout(tick, 200);
  };
  setTimeout(tick, 240);
}

/* ---------- chế độ dữ liệu thử ---------- */
function rng(seed: number): () => number {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
}
function dirtify(text: string, rnd: () => number): string {
  if (!text) return text;
  const bul = ['* ', '- ', '•', '*  ', '+ '];
  let out = String(text).split('\n').map((l) => {
    let t = l;
    if (/^•\s/.test(t)) t = bul[Math.floor(rnd() * bul.length)] + t.replace(/^•\s*/, '');
    else if (/:\s*$/.test(t) && rnd() < 0.7) t = (rnd() < 0.3 ? "'" : '') + '*' + t.trim() + '*';
    t = t.replace(/ → /g, rnd() < 0.5 ? ' -> ' : '->').replace(/ – /g, ' - ');
    if (rnd() < 0.35) t = t.replace(/ /, '  ');
    if (rnd() < 0.3) t += '   ';
    if (rnd() < 0.22 && /^•\s/.test(l)) t += ' - [LADP-' + (300 + Math.floor(rnd() * 200)) + '|https://xanhsm.atlassian.net/browse/LADP-' + (300 + Math.floor(rnd() * 200)) + ']';
    if (rnd() < 0.15) t = t.replace(/(\d+)\s?%/, '$1 %');
    return t;
  }).join('\r\n');
  if (rnd() < 0.4) out = out.replace('\r\n', '\r\n\r\n');
  return out;
}
const RISKS = ['Thiếu SA dedicate, chậm review thiết kế 1 tuần', 'Chờ phê duyệt ANBM từ khối Bảo mật, có nguy cơ trễ go-live', 'Dữ liệu nguồn từ 360 bị lỗi schema, chưa có phương án fallback',
  'Phụ thuộc team Platform release API mới, đang blocked', 'Vendor GPU giao trễ, không kịp huấn luyện lại trước 30/11', 'Thiếu nhãn dữ liệu cho tập test, kết quả đánh giá chưa đạt'];
const PROPS = ['Đề xuất BGĐ hỗ trợ ưu tiên nguồn lực SA', 'Đề xuất họp 3 bên chốt lại mốc trong tuần', 'Đề xuất dùng dữ liệu tháng 9 tạm thời', 'Đề xuất escalate lên GĐK QLTT'];
const CLEAN_NAME = 'Dữ liệu chuẩn';

function dirtyRows(rows: Row[], seed: number): void {
  const rnd = rng(seed * 977);
  const ST = ['in progress', 'In_Progress', 'IN  PROGRESS ', 'In-Progress'], PG = ['on track', 'ON-TRACK', 'On_track ', 'on-Track'];
  rows.forEach((r, j) => {
    const raw: Record<string, string> = (r.raw = {});
    (['ht', 'w1ht', 'w1kh', 'w2ht', 'w2kh'] as const).forEach((k) => { const v = r[k]; if (v) { const dv = dirtify(v, rnd); raw[k] = dv; r[k] = cleanText(dv); } });
    if (r.kpi) {
      const kr = '||*STT*||*KPI*||*Chỉ số chính*||*Kết quả thực tế*||\r\n' + r.kpi.split('\n').map((x, k) => '|' + (k + 1) + '|' + x.replace(/^\d+\.\s*/, '') + ' | | |').join('\r\n') + '\r\n| | | | |';
      raw.kpi = kr; r.kpi = cleanKpi(kr);
    }
    if (r.comment) {
      const cr = (6 + (j % 20)) + '/Nov/26 ' + (9 + (j % 8)) + ':0' + (j % 6) + ' AM;712020:c8bea68a-' + (1000 + j) + ';{{2026-11-' + String(10 + (j % 9)).padStart(2, '0') + '}} \r\n\r\n' + dirtify(r.comment, rnd);
      raw.comment = cr; r.comment = cleanComment(cr);
    }
    if (r.rawStatus === 'IN PROGRESS' && rnd() < 0.5) raw.rawStatus = r.rawStatus = ST[j % ST.length];
    if (r.rawProgress === 'On-track' && rnd() < 0.5) raw.rawProgress = r.rawProgress = PG[j % PG.length];
  });
}

function riskRows(rows: Row[]): void {
  rows.forEach((r, j) => {
    if (r.isNew) return;
    if (j % 3 === 0) {
      const rk = RISKS[j % RISKS.length], pp = PROPS[j % PROPS.length];
      r.comment = 'Risk: ' + rk + '\n→ ' + pp;
      r.ai.vd = { text: 'Rủi ro: ' + rk + '.\n→ ' + pp + '.', why: 'Comment ' + (10 + (j % 9)) + '/11 có ghi Risk', src: r.comment, ok: j % 2 === 0 };
      r.ai.rui = { text: j % 2 ? 'Cao' : 'Trung bình', why: 'Comment có ghi risk', src: r.comment, ok: j % 2 === 0 };
      if (j % 6 === 0) r.rawProgress = 'Off-track';
    } else if (j % 3 === 1) {
      r.ai.vd = { text: 'Không có vấn đề phát sinh trong tuần.', why: 'Progress Report', src: '', ok: true };
      r.ai.rui = { text: 'Thấp', why: 'đúng tiến độ', src: '', ok: true };
    }
  });
}

/* "Nhiều dự án (giả lập)": pfApply đầy đủ — mọi giá trị có luật, đủ ô bắt buộc, nháp AI đã duyệt */
function fillAll(rows: Row[], vis: Row[], ctx: CellCtx): void {
  const okPhase = Object.keys(ctx.phaseBucket).filter((k) => ctx.phaseBucket[k]);
  const okSt = Object.keys(STATUS_MAP).find((k) => STATUS_MAP[k] === 'Đang thực hiện') || 'IN PROGRESS';
  const okPg = Object.keys(PROG_MAP).find((k) => PROG_MAP[k] === 'Đúng tiến độ') || 'On-track';
  vis.forEach((r, j) => {
    if (!ctx.phaseBucket[r.rawPhase]) r.rawPhase = okPhase[j % okPhase.length];
    if (!mapNorm(STATUS_MAP, r.rawStatus)) r.rawStatus = okSt;
    if (!mapNorm({ PENDING: '1' }, r.rawStatus) && !mapNorm(PROG_MAP, r.rawProgress)) r.rawProgress = okPg;
    if (r.labels && r.labels.indexOf(r.g + '.') !== 0) r.labels = r.g + '.1';
    if (!r.milestone) r.milestone = '30/11: Hoàn tất ' + (j % 2 ? 'UAT' : 'pilot') + '\n31/12: Đánh giá kết quả';
    if (!r.output) r.output = 'Tài liệu ' + (j % 3 ? 'thiết kế giải pháp' : 'đánh giá mô hình') + ' v' + (1 + (j % 3));
    if (!r.pic) r.pic = ['Trần Minh', 'Phan Ngọc', 'Mai Linh', 'Đặng Quân'][j % 4];
  });
  addDrafts(rows, vis, ctx);
  vis.forEach((r) => { r.stages = r.stages.map((st) => (st === 'miss' ? 'todo' : st)); });
  vis.forEach((r) => {
    AI_IDS.forEach((k) => {
      const a = r.ai[k];
      if (!a) r.ai[k] = { text: k === 'rui' ? 'Thấp' : 'Không có vấn đề phát sinh trong tuần.', why: 'Progress Report', src: '', ok: true };
      else a.ok = true;
    });
    FIELDS.forEach((f) => {
      if (['none', 'ai', 'future'].includes(f.kind) || f.id === 'note' || ['w1', 'w2', 'w4'].includes(f.grp) || cellValue(r, f, ctx) !== null) return;
      const donor = vis.find((x) => x !== r && cellValue(x, f, ctx) !== null);
      const dv = donor ? cellValue(donor, f, ctx)! : '—';
      txt(r)[f.id] = dv;
      if (cellValue(r, f, ctx) === null) r.ovr[f.id] = dv;
    });
  });
}

/** Dựng dữ liệu của một kịch bản từ dòng gốc (prototype: pfReset + enterTest + pfApply theo từng kịch bản). */
function applyScenario(d: Draft<AppState>, sc: Exclude<TestScenario, null>): void {
  const rows = baseRows(), ctx: CellCtx = { phaseBucket: { ...PHASE_BUCKET } };
  d.realOnly = sc === 'perfect';
  d.newCodes = 'pending'; d.dupMerged = false; d.unsorted = [...PHASE_UNSORTED]; d.phaseBucket = ctx.phaseBucket;
  const vis = (): Row[] => rowsOf({ allRows: rows, newCodes: d.newCodes, dupMerged: d.dupMerged, realOnly: d.realOnly });
  if (sc === 'dirty') dirtyRows(rows, d.testSeed);
  else if (sc === 'risk') riskRows(rows);
  else if (sc === 'errors') addDrafts(rows, vis(), ctx);
  else {
    d.newCodes = 'added'; d.dupMerged = true;
    if (sc === 'perfect') addDrafts(rows, vis(), ctx);
    else { d.unsorted = []; fillAll(rows, vis(), ctx); }
  }
  d.allRows = castDraft(rows);
  dropRowSession(d);
  d.test = sc; d.menu = null;
  const nm = sc === 'dirty' || sc === 'risk' ? SCEN[sc].name : CLEAN_NAME;
  log(d, 'Chế độ test', nm, 'Dữ liệu giả — không ảnh hưởng dữ liệu thật');
  if (sc === 'dirty' || sc === 'risk') toast(d, 'Chế độ test · ' + nm);
  else {
    d.view = 'import'; d.panel = null; d.modal = null;
    toast(d, sc === 'many' ? 'Dữ liệu thử · ' + SCEN.many.name : 'Chế độ test · ' + SCEN[sc].name);
  }
}

/** Vào (hoặc đổi) kịch bản thử; chỉ lần vào đầu tiên mới ghi lại dữ liệu thật để thoát ra khôi phục. */
export function enterTest(sc: Exclude<TestScenario, null>): void {
  const s = getState();
  mutate((d) => {
    if (s.test === null) d.testOrig = castDraft({ allRows: s.allRows, realOnly: s.realOnly, phaseBucket: s.phaseBucket, unsorted: s.unsorted, newCodes: s.newCodes, dupMerged: s.dupMerged });
    applyScenario(d, sc);
  }, { resetUndo: true });
}

/** "↻ Sinh lại": đổi hạt ngẫu nhiên rồi dựng lại kịch bản đang chạy. */
export function testReseed(): void {
  mutate((d) => { if (!d.test) return; d.testSeed = (d.testSeed || 7) + 1; applyScenario(d, d.test); }, { resetUndo: true });
}

export function exitTest(): void {
  mutate((d) => {
    if (!d.test) return;
    const o = d.testOrig;
    if (o) { d.allRows = o.allRows; d.realOnly = o.realOnly; d.phaseBucket = o.phaseBucket; d.unsorted = o.unsorted; d.newCodes = o.newCodes; d.dupMerged = o.dupMerged; }
    dropRowSession(d);
    d.test = null; d.testOrig = null; d.menu = null;
    log(d, 'Thoát chế độ test', '', 'Khôi phục dữ liệu demo');
    toast(d, 'Đã thoát chế độ test');
  }, { resetUndo: true });
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
export function pvStage(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } | undefined): Promise<void> {
  if (!file) { mutate((d) => toast(d, 'Không thấy file nào được thả vào')); return Promise.resolve(); }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!PV_EXT.includes(ext)) { mutate((d) => toast(d, 'Chỉ nhận file CSV hoặc Excel (.csv, .xlsx, .xls)')); return Promise.resolve(); }
  const tk = ++pvToken, big = file.size > 60 * 1048576;
  mutate((d) => {
    d.pv = { name: file.name, size: file.size, ext, loading: !big, done: false };
    if (big) d.pv.err = 'File lớn hơn 60 MB, không xem trước được.';
    d.pvSheet = 0; d.pvFs = false;
  });
  if (big) return Promise.resolve();
  const done = (patch: Partial<PreviewFile>): void => { if (tk === pvToken) mutate((d) => { if (d.pv) Object.assign(d.pv, castDraft(patch), { loading: false }); }); };
  return file.arrayBuffer().then(pvParse).then(done, (e: unknown) => done({ err: (e instanceof Error && e.message) || 'Không đọc được file này.' }));
}
/** "Đọc file này": nạp file đã xem trước. */
export function pvGo(): void {
  const f = getState().pv;
  if (!f || !f.sheets) return;
  mutate((d) => { if (d.pv) d.pv.done = true; });
  loadFile(f.name);
}
export function pvSetSheet(k: number): void { mutate((d) => { d.pvSheet = k; }); }
export function pvSetFs(open: boolean): void { mutate((d) => { d.pvFs = open && !!d.pv?.sheets; }); }

/** "Thay file khác" (bỏ file đang xem trước) / "Giữ file đang dùng". */
export function setReplaceFile(on: boolean): void {
  if (on) pvToken++;
  mutate((d) => { d.replaceFile = on; if (on) { d.pv = null; d.pvSheet = 0; d.pvFs = false; } });
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

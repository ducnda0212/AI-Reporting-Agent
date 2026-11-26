/* Dữ liệu thử CHỈ cho test: dựng phản hồi giống POST /ingest/upload từ bộ dòng Jira đã dọn (fixtures/jira-rows.json),
   rồi nạp qua đúng hàm production `applyIngest`. Không có dữ liệu giả nào trong mã chạy thật. */
import { castDraft } from 'immer';
import { vi } from 'vitest';
import { api } from '@/services/api';
import { FIELDS, setCycle } from '@/data/constants';
import { aiDrafts } from '@/lib/ai';
import type { CellCtx } from '@/lib/cell';
import { applyIngest } from '@/store/actions/flow';
import { getState, log, mutate, rowsOf } from '@/store';
import type { IngestResponse, MappingConfigOut, Row, VersionItem, WeekReport } from '@/types';
import fx from './fixtures/jira-rows.json';

type Gold = (typeof fx.rows)[number];
type Text = Record<string, string | undefined>;
const txt = (r: Row): Text => r as unknown as Text;

export const GOLD_FILE = fx.file;
export const FILE_STATS = fx.stats;
export const GOLD_COLS: readonly string[] = fx.cols;
export const GOLD_ORPHANS = 3;

/* mã giai đoạn (1-12) của từng giá trị Phase trong bộ dòng thử */
export const PHASE_BUCKET: Record<string, number> = {
  '1.Xác.định.bài.toán.AI': 1, '2.Xác.định.yêu.cầu.nghiệp.vụ.chi.tiết': 2, '3.Khảo.sát.dữ.liệu': 3, '4.Thiết.kế.giải.pháp': 4,
  '5.Huấn.luyện.mô.hình': 5, '6.Đánh.giá.mô.hình': 6, '7.Phát.triển.phần.mềm': 7, '8.Tích.hợp.Software.&.Event.Logging': 8,
  '9.Kiểm.thử.UAT': 9, '10.Đánh.giá.ANBM': 10, '11.Go-live': 11, '12.Đánh.giá.sau.Go-live': 12,
  '10. Triển khai thử nghiệm (Pilot)': 10, '9. Kiểm thử chất lượng (SIT/UAT/A-B Test)': 9, '2. Đặc tả yêu cầu nghiệp vụ': 2,
  '7. Đóng gói mô hình và phát triển API': 7, '8. Tích hợp phần mềm và ghi log sự kiện': 8, '5. Chuẩn bị và xử lý dữ liệu': 5,
  '11. Đưa vào vận hành (Go-Live)': 11, '3. Thiết kế kiến trúc giải pháp': 3, '6. Huấn luyện và tinh chỉnh mô hình': 6,
  '4. Thiết kế giao diện (UI/UX)': 4, '12. Vận hành, giám sát và tối ưu liên tục': 12
};
const CTX0: CellCtx = { phaseBucket: PHASE_BUCKET };

const NAMES2 = ['Trần Minh', 'Phan Ngọc', 'Lý Phương', 'Đặng Quân', 'Hồ Ruby', 'Tạ Sơn', 'Lâm Thảo', 'Vũ Hải'];
const DOM2: Record<string, string> = { 'I.A': 'Food', 'I.C': 'Ride', 'II.A': 'Driver', 'II.B': 'Fleet', 'II.D': 'Platform', 'II.E': 'Platform', 'II.I': 'Platform' };
const PHONG_OF: Record<string, string> = { 'I.A': 'P. AI Food & Express', 'I.C': 'P. AI Ride', 'II.A': 'P. AI Tài xế', 'II.B': 'P. AI Phương tiện', 'II.D': 'P. Nền tảng & Quản trị', 'II.E': 'P. MLOps', 'II.I': 'P. Công cụ MOC' };
const MANG: Record<string, string> = fx.mang;

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

const UNIT_IDS: readonly string[] = ['gdk', 'phong', 'tp'];
const CFG_IDS = FIELDS.filter((f) => f.kind === 'cfg').map((f) => f.id);

/* cột hệ thống (cfg): máy chủ thật trả sẵn; ở đây dựng từ dòng để có đủ giá trị cho test */
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

/** Dòng như lúc máy chủ trả về (chưa có nháp AI). */
export function baseRows(): Row[] {
  const rows = fx.rows.map(buildRow);
  rows.forEach((r) => { if (r.ma === 'I.A.4.1') { r.stages[7] = 'miss'; r.stages[9] = 'miss'; } });
  applyCatalogue(rows);
  return rows;
}

export const MAPPING: MappingConfigOut = {
  id: 'map_default_pmo_49col', name: 'Hệ thống', is_default: true, status: 'active', version: 1, columns: [],
  value_mappings: { status_map: {}, progress_map: {}, phase_map: {}, phase_bucket: PHASE_BUCKET }
};

/** Phản hồi giả của POST /ingest/upload cho bộ dòng thử. */
export function fixtureResponse(name = GOLD_FILE, rows: Row[] = baseRows()): IngestResponse {
  const gs: string[] = [...new Set(rows.map((r) => r.g))];
  return {
    success: true, session_id: 'sess_test', file_name: name, is_duplicate_file: false,
    file_stats: { total_rows: fx.stats.issues, total_cols: fx.stats.cols, skipped_empty_rows: 0, matched_projects: rows.filter((r) => r.real).length, dup_groups: fx.stats.dupGroups, dup_cols: fx.stats.dupCols, used_cols: 24 },
    file_cols: [...fx.cols], groups: gs.map((k) => ({ k, name: MANG[k] || k })),
    applied_mapping: { id: MAPPING.id, name: MAPPING.name, matched_cols: 42, total_cols: 49 },
    diff_summary: { has_previous_session: false, added_projects: [], removed_projects: [], modified_count: 0, schema_changes: [] },
    rows, orphans: [], blockers: [], warnings: []
  };
}

/** Kỳ báo cáo của bộ dòng thử (như GET /cycles/active): hôm nay 20/11/2026, tuần 3 đang làm. */
export const FIXTURE_WEEKS = [
  { k: 'w1', name: 'Tuần 01/11 · 31/10–06/11', range: '31/10–06/11', cur: false, future: false, start: '2026-10-31', end: '2026-11-06' },
  { k: 'w2', name: 'Tuần 02/11 · 07–14/11', range: '07–14/11', cur: false, future: false, start: '2026-11-07', end: '2026-11-14' },
  { k: 'w3', name: 'Tuần 3/11 · 15–22/11', range: '15–22/11', cur: true, future: false, start: '2026-11-15', end: '2026-11-22' },
  { k: 'w4', name: 'Tuần 04/11 · 23–30/11', range: '23–30/11', cur: false, future: true, start: '2026-11-23', end: '2026-11-30' }
];
export function setFixtureCycle(): void {
  setCycle('2026-11-20', FIXTURE_WEEKS);
  mutate((d) => { d.weeks = FIXTURE_WEEKS; d.activeToday = '2026-11-20'; }, { track: false });
}

/** Ba bản đã chốt mẫu vào danh sách phiên bản (máy chủ chưa có API này ở Giai đoạn 1). */
export function seedVersions(): void {
  setFixtureCycle();
  mutate((d) => { d.versions = castDraft(structuredClone(SEED_VERSIONS)); }, { track: false });
}

/** Nạp bộ dòng thử như vừa đọc xong một file, kèm nháp AI ở AC/AS/AT (như Giai đoạn 2). Thay cho `loadFileNow` cũ. */
export function loadFixture(name = GOLD_FILE, opts: { drafts?: boolean } = {}): void {
  const rows = baseRows();
  const res = fixtureResponse(name, rows);
  setFixtureCycle();
  mutate((d) => { d.mappings = castDraft([MAPPING]); });
  applyIngest(res);
  mutate((d) => { d.phaseBucket = { ...PHASE_BUCKET }; log(d, 'Nhập file Jira', name, FILE_STATS.cols + ' cột · gộp ' + FILE_STATS.dupGroups + ' nhóm cột trùng tên', 'Cảnh báo'); });
  if (opts.drafts === false) return;
  const drafts = aiDrafts(rowsOf(getState()), CTX0);
  mutate((d) => { drafts.forEach((x) => { d.allRows[x.i].ai[x.f] = castDraft(x.d); }); }, { resetUndo: true });
}

/* ba bản đã chốt mẫu cho test màn Phiên bản (không còn trong mã chạy thật) */
export const SEED_VERSIONS: VersionItem[] = [
  { wk:'w2', v:2, by:'Khuê', at:'14/11 16:20', note:'Sửa sau họp khối: cập nhật rủi ro II.E.1.2', exported:'20261114_DAN_Bao-cao-PMO.xlsx',
    stats:{ rows:38, hand:6, ai:114 }, changes:[['II.E.1.2','AC Mức độ rủi ro','Thấp','Trung bình'],['II.E.1.2','AT Vấn đề, rủi ro…','Không có','Xin lùi golive sang 15/11 vì chờ PD DPO, ANBM'],['I.C.1.2','J Tiến độ','Đúng tiến độ','Chậm tiến độ']] },
  { wk:'w2', v:1, by:'Khuê', at:'13/11 17:05', note:'Bản gửi trước họp', exported:'20261113_DAN_Bao-cao-PMO.xlsx', stats:{ rows:38, hand:4, ai:114 }, changes:[] },
  { wk:'w1', v:1, by:'Tuấn', at:'07/11 09:40', note:'', exported:'20261107_DAN_Bao-cao-PMO.xlsx', stats:{ rows:37, hand:9, ai:111 }, changes:[] }
];

/** Máy chủ giả cho chốt bản / xuất Excel: bản trả về lặp lại đúng những gì client gửi (số bản tăng theo tuần). */
export function mockReportApi(): void {
  const n: Record<string, number> = {};
  vi.spyOn(api, 'lockReport').mockImplementation(async (req) => {
    const v = (n[req.wk] = (n[req.wk] || 0) + 1);
    return { id: 'ver_' + req.cycle_id.slice(0, 7) + '_' + req.wk + '_v' + v, session_id: req.session_id, cycle_id: req.cycle_id, wk: req.wk, v, by: req.by, at: '20/11 09:05',
      note: req.note, exported: null, stats: req.stats, changes: [], snap: req.snap, fmt: req.fmt, wrap: req.wrap, hidden: req.hidden, edits: req.edits, mine: true, fileName: req.file_name };
  });
  vi.spyOn(api, 'exportExcel').mockImplementation(async (req) => ({ blob: new Blob(['xlsx']), fileName: req.file_name || 'bao-cao.xlsx' }));
}

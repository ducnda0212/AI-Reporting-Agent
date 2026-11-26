/* Phiên bản: ảnh chụp bảng, so sánh 2 bản, danh sách bản, mốc chỉnh sửa. Port từ prototype v4; không đọc state toàn cục. */
import { CX_PH, FIELDS, RUI_LV, TODAY, TT_RK, WEEKS, WK_TXT } from '@/data/constants';
import type { AiCell, AppState, LogEntry, Row, VerEdit, VersionChange, VersionItem, WeekKey } from '@/types';
import { activeWkOf, cellValue, effectiveKind, fieldById, parseVN, type CellCtx } from './cell';

/** Ảnh chụp bảng: khoá `mã|cột` → giá trị. */
export type Snap = Record<string, string | null>;
/** Phần state mà vSnap cần. */
export type VCtx = CellCtx & Pick<AppState, 'loaded' | 'versions'>;

export function snapshot(rows: Row[], ctx: CellCtx): Snap {
  const m: Snap = {};
  rows.forEach((r) => FIELDS.forEach((f) => {
    if (effectiveKind(f, ctx) === 'future' || f.kind === 'none') return;
    let v = cellValue(r, f, ctx);
    if (f.kind === 'ai') { const d = r.ai[f.id as 'rui']; v = d && d.ok ? d.text : null; }
    m[r.ma + '|' + f.id] = v;
  }));
  return m;
}

/** Các ô khác nhau giữa hai ảnh chụp: [mã, "cột tên", cũ, mới]. */
export function diffSnap(a: Snap, b: Snap): VersionChange[] {
  const out: VersionChange[] = [];
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  keys.forEach((k) => {
    const x = a[k] ?? null, y = b[k] ?? null;
    if (x === y) return;
    const [ma, id] = k.split('|');
    const f = fieldById(id);
    if (f) out.push([ma, f.col + ' ' + f.name, x as string, y as string]);
  });
  return out;
}

export const vKey = (v: Pick<VersionItem, 'wk' | 'v'> | null): string => (v ? v.wk + '|' + v.v : 'cur');

/** Danh sách bản theo tuần (tuần hiện tại có dòng `cur`), bản mới nhất lên trước. */
export function vhList(versions: VersionItem[]): { k: string; wk: WeekKey; v?: VersionItem }[] {
  const L: { k: string; wk: WeekKey; v?: VersionItem }[] = [];
  WEEKS.forEach((w) => {
    if (w.cur) L.push({ k: 'cur', wk: w.k });
    versions.filter((v) => v.wk === w.k).sort((a, b) => b.v - a.v).forEach((v) => L.push({ k: vKey(v), wk: w.k, v }));
  });
  return L;
}

/** Ảnh chụp của một bản (`null` = bảng đang làm). Bản cũ chưa lưu ảnh được dựng minh hoạ từ bảng hiện tại. */
export function vSnap(v: VersionItem | null, rows: Row[], ctx: VCtx): Snap | null {
  if (!v) return ctx.loaded ? snapshot(rows, ctx) : null;
  if (v.snap) return v.snap;
  if (!ctx.loaded) return null;
  const s = snapshot(rows, ctx);
  const cur = activeWkOf(ctx), later = (['w1', 'w2', 'w3', 'w4'] as const).filter((w) => w > v.wk && w <= cur);
  rows.forEach((r) => {
    (['rui', 'kh', 'vd'] as const).forEach((fid) => { const k = r.ma + '|' + fid; if (s[k] == null && r.ai[fid]?.text) s[k] = r.ai[fid]!.text; });
    later.forEach((w) => FIELDS.forEach((f) => { if (f.grp === w) s[r.ma + '|' + f.id] = null; }));
    WK_TXT[cur].forEach((fid, j) => { if (v.wk !== cur) s[r.ma + '|' + fid] = s[r.ma + '|' + WK_TXT[v.wk][j]]; });
  });
  const setC = (c: VersionChange, val: string): void => {
    const f = FIELDS.find((x) => c[1].startsWith(x.col + ' '));
    if (f && rows.some((r) => r.ma === c[0])) s[c[0] + '|' + f.id] = val;
  };
  (v.changes || []).forEach((c) => setC(c, c[3]));
  ctx.versions.filter((x) => x.wk === v.wk && x.v === v.v + 1).forEach((nx) => (nx.changes || []).forEach((c) => setC(c, c[2])));
  return s;
}

export function vStats(s: Snap | null): { n: number; late: number; high: number } | null {
  if (!s) return null;
  const M = [...new Set(Object.keys(s).map((k) => k.split('|')[0]))];
  return { n: M.length, late: M.filter((m) => /Chậm/.test(s[m + '|td'] || '')).length, high: M.filter((m) => s[m + '|rui'] === 'Cao').length };
}

/* ---------- so sánh 2 bản ---------- */

export interface CmpSide { key: string; wk: WeekKey; snap: Snap; demo?: boolean }

/** Một vế so sánh: ảnh chụp + tuần + cờ minh hoạ; `null` nếu chưa có dữ liệu (chưa nhập file). */
export function vSide(v: VersionItem | null, rows: Row[], ctx: VCtx): CmpSide | null {
  const snap = vSnap(v, rows, ctx);
  return snap ? { key: vKey(v), wk: v ? v.wk : activeWkOf(ctx), snap, demo: !!v && !v.snap } : null;
}

export interface CmpOverview { run: number; ok: number; risk: number; late: number; high: number; pct: number | null }
export interface CmpItem { ma: string; viec: string; what: string; k: string }
export interface CmpPlan { ma: string; viec: string; tt: string; run: boolean; pA: Cx; dB: Cx; vA: Cx; vB: Cx; pB: Cx; st: 'none' | 'done'; iss: 'new' | 'gone' | 'same' | 'still' | '' }
export interface CmpEdit { ma: string; viec: string; ch: { n: string; a: string; b: string; long: boolean }[] }
export interface Compare {
  A: CmpOverview; B: CmpOverview;
  bad: CmpItem[]; good: CmpItem[]; plan: CmpPlan[]; edits: CmpEdit[];
  onlyA: string[]; onlyB: string[]; both: string[];
  mismatch: boolean; cross: boolean; wa: WeekKey; wb: WeekKey; nA: number; nB: number; demo: boolean; rev: boolean;
}
interface Cx { v: string; draft: boolean }

const WK_IX: Record<WeekKey, number> = { w1: 1, w2: 2, w3: 3, w4: 4 };
const masOf = (S: Snap): string[] => [...new Set(Object.keys(S).map((k) => k.split('|')[0]))];

/* chữ giữ chỗ (không có nội dung thật) coi như trống khi so sánh */
function cxV(S: Snap, m: string, f: string): string {
  const v = S[m + '|' + f];
  const t = v == null ? '' : String(v).trim();
  return CX_PH.test(t) ? '' : t;
}

/* bảng đang làm: đọc nháp AI chưa duyệt (chỉ để so sánh, có đánh dấu) */
function cxGet(S: Snap, isCur: boolean, m: string, f: string, rows: Row[]): Cx {
  const v = cxV(S, m, f);
  if (v || !isCur) return { v, draft: false };
  const d = (rows.find((x) => x.ma === m)?.ai as Record<string, AiCell | undefined> | undefined)?.[f];
  const t = (d?.text ? String(d.text).trim() : '').split('\n').filter((l) => !/^Chưa có Progress Report/.test(l.trim())).join('\n').trim();
  return t && !CX_PH.test(t) ? { v: t, draft: true } : { v: '', draft: false };
}

const cxRun = (S: Snap, m: string): boolean => cxV(S, m, 'tt') === 'Đang thực hiện';

function cxTT(S: Snap, isCur: boolean, m: string, rows: Row[]): string {
  const due = parseVN(cxV(S, m, 'end'));
  if (/Chậm/.test(cxV(S, m, 'td')) || (due && due < TODAY)) return 'Chậm tiến độ';
  if ((due && (due.getTime() - TODAY.getTime()) / 864e5 <= 14) || cxGet(S, isCur, m, 'rui', rows).v === 'Cao') return 'Có nguy cơ chậm';
  return 'Đúng tiến độ';
}

export function vCompare2(a: CmpSide, b: CmpSide, rows: Row[]): Compare {
  const A = a.snap, B = b.snap, ca = a.key === 'cur', cb = b.key === 'cur', wa = a.wk, wb = b.wk, cross = wa !== wb;
  const MA = masOf(A), MB = masOf(B), setB = new Set(MB), setA = new Set(MA);
  const both = MA.filter((m) => setB.has(m)).sort();
  const onlyA = MA.filter((m) => !setB.has(m)).sort(), onlyB = MB.filter((m) => !setA.has(m)).sort();
  const mismatch = both.length < Math.max(MA.length, MB.length) * 0.5;
  const scope = mismatch ? both : null;
  const ov = (S: Snap, isCur: boolean, set: string[] | null): CmpOverview => {
    const L = (set || masOf(S)).filter((m) => cxRun(S, m));
    const o: CmpOverview = { run: L.length, ok: 0, risk: 0, late: 0, high: 0, pct: null };
    L.forEach((m) => {
      const t = cxTT(S, isCur, m, rows);
      if (t === 'Đúng tiến độ') o.ok++; else if (t === 'Có nguy cơ chậm') o.risk++; else o.late++;
      if (cxGet(S, isCur, m, 'rui', rows).v === 'Cao') o.high++;
    });
    o.pct = o.run ? Math.round((o.ok / o.run) * 100) : null;
    return o;
  };
  const bad: CmpItem[] = [], good: CmpItem[] = [], plan: CmpPlan[] = [], edits: CmpEdit[] = [];
  both.forEach((m) => {
    const ta = cxTT(A, ca, m, rows), tb = cxTT(B, cb, m, rows), viec = rows.find((x) => x.ma === m)?.viec ?? '';
    const add = (list: CmpItem[], what: string, k: string): void => { list.push({ ma: m, viec, what, k }); };
    if (TT_RK[tb] > TT_RK[ta]) add(bad, ta + ' → ' + tb, 'tt');
    if (TT_RK[tb] < TT_RK[ta]) add(good, ta + ' → ' + tb, 'tt');
    const rA = cxGet(A, ca, m, 'rui', rows).v, rB = cxGet(B, cb, m, 'rui', rows).v, ra = RUI_LV[rA] || 0, rb = RUI_LV[rB] || 0;
    if (ra && rb && rb > ra) add(bad, 'Rủi ro ' + rA + ' → ' + rB, 'rui');
    if (ra && rb && rb < ra) add(good, 'Rủi ro ' + rA + ' → ' + rB, 'rui');
    const eA = cxV(A, m, 'end'), eB = cxV(B, m, 'end'), ea = parseVN(eA), eb = parseVN(eB);
    if (ea && eb && eb > ea) add(bad, 'Dời hạn ' + eA + ' → ' + eB, 'end');
    if (ea && eb && eb < ea) add(good, 'Kéo hạn sớm hơn ' + eA + ' → ' + eB, 'end');
    if (cxV(A, m, 'tt') !== 'Đã hoàn thành' && cxV(B, m, 'tt') === 'Đã hoàn thành') add(good, 'Đã hoàn thành', 'tt');
    if (cxV(A, m, 'tt') === 'Đang thực hiện' && /Tạm dừng|Hủy/.test(cxV(B, m, 'tt'))) add(bad, 'Chuyển sang ' + cxV(B, m, 'tt'), 'tt');
    /* mục 3–5 của báo cáo: hẹn tuần trước – làm tuần này – vấn đề */
    const ka = WK_TXT[wa], kb = WK_TXT[wb];
    const pA = cxGet(A, ca, m, ka[1], rows), dB = cxGet(B, cb, m, kb[0], rows), vA = cxGet(A, ca, m, ka[2], rows), vB = cxGet(B, cb, m, kb[2], rows), pB = cxGet(B, cb, m, kb[1], rows);
    if (cross) {
      const st = !dB.v ? 'none' : 'done';
      const iss = !vA.v && vB.v ? 'new' : vA.v && !vB.v ? 'gone' : vA.v && vB.v ? (vA.v === vB.v ? 'same' : 'still') : '';
      if (iss === 'new') add(bad, 'Phát sinh vấn đề mới' + (vB.draft ? ' (nháp AI)' : ''), 'vd');
      if (iss === 'gone') add(good, 'Hết vấn đề tồn đọng', 'vd');
      if (st === 'none' && cxRun(B, m)) add(bad, 'Chưa có cập nhật trong tuần', 'ht');
      plan.push({ ma: m, viec, tt: tb, run: cxRun(B, m), pA, dB, vA, vB, pB, st, iss });
    }
    /* sửa nội dung giữa 2 bản (cùng tuần) hoặc các cột không theo tuần (khác tuần) */
    const F = ['tt', 'td', 'end', 'rui', 'pic', 'action', 'nextstep', 'giatri', 'buoc', ...(cross ? [] : kb)];
    const ch: CmpEdit['ch'] = [];
    F.forEach((fid) => {
      const f = fieldById(fid);
      if (!f) return;
      const x = cxGet(A, ca, m, fid, rows), y = cxGet(B, cb, m, fid, rows);
      if (x.v !== y.v) ch.push({ n: f.name, a: x.v + (x.draft ? ' (nháp AI)' : ''), b: y.v + (y.draft ? ' (nháp AI)' : ''), long: WK_TXT.w3.includes(fid) });
    });
    if (ch.length) edits.push({ ma: m, viec, ch });
  });
  return {
    A: ov(A, ca, scope), B: ov(B, cb, scope), bad, good, plan, edits, onlyA, onlyB, both, mismatch, cross, wa, wb,
    nA: MA.length, nB: MB.length, demo: !!(a.demo || b.demo), rev: WK_IX[wa] > WK_IX[wb]
  };
}

/** Câu nhận xét ngắn để sao chép; `nameA`/`nameB` là nhãn hiển thị của hai bản. */
export function cxNote(C: Compare, nameA: string, nameB: string): string {
  const { A, B } = C, d = (x: number, y: number): number => y - x;
  let s = nameB + ': ' + B.run + ' dự án đang chạy, ' + B.ok + ' đúng tiến độ' + (B.pct != null ? ' (' + B.pct + '%)' : '') + ', ' + B.risk + ' có nguy cơ chậm, ' + B.late + ' chậm tiến độ';
  const parts: string[] = [];
  if (d(A.late, B.late)) parts.push((d(A.late, B.late) > 0 ? 'tăng ' : 'giảm ') + Math.abs(d(A.late, B.late)) + ' dự án chậm');
  if (d(A.risk, B.risk)) parts.push((d(A.risk, B.risk) > 0 ? 'tăng ' : 'giảm ') + Math.abs(d(A.risk, B.risk)) + ' dự án có nguy cơ');
  s += parts.length ? '; so với ' + nameA + ' ' + parts.join(', ') + '.' : '; không đổi so với ' + nameA + '.';
  const w = C.bad.filter((x) => x.k === 'tt').map((x) => x.ma);
  if (w.length) s += ' Cần chú ý: ' + w.slice(0, 3).join(', ') + (w.length > 3 ? '…' : '') + '.';
  return s;
}

/* ---------- mốc chỉnh sửa của bản ---------- */

export interface VerEditRow { when: string; who: string; what: string; obj: string; d: string }

export const EDIT_RE = /^(Sửa|Duyệt|Điền|Hoàn tác|Bỏ nháp|Ghép|Gọi AI|Nhờ AI|Agent|Thêm|Xoá|Xóa|Gửi yêu cầu|Đồng ý|Quy đổi)/;

/** Các lần sửa kể từ lần chốt trước (`lockSeq` = số thứ tự nhật ký lúc chốt). */
export function verEditsNow(log: LogEntry[], lockSeq: number): VerEdit[] {
  return log.filter((e) => (e.seq || 0) > lockSeq && EDIT_RE.test(e.a)).map((e) => ({ t: e.t, day: e.day || '', a: e.a, o: e.o, d: e.d }));
}

/** Mốc chỉnh sửa để hiển thị: bảng đang làm (`v` null) dùng `now`; bản đã chốt dùng `edits` hoặc suy từ `changes`. */
export function verEditList(v: VersionItem | null, now: VerEdit[]): VerEditRow[] {
  if (!v) return now.map((e) => ({ when: e.t, who: 'Bạn', what: e.a, obj: e.o, d: e.d }));
  if (v.edits) return v.edits.map((e) => ({ when: (e.day ? e.day.slice(0, 5) + ' ' : '') + e.t, who: v.by, what: e.a, obj: e.o, d: e.d }));
  return (v.changes || []).map((c) => ({ when: '', who: v.by, what: 'Sửa ' + c[1], obj: c[0], d: (c[2] || 'trống') + ' → ' + (c[3] || 'trống') }));
}

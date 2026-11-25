/* Bảng 49 cột: chọn ô, sửa ô (một đường ghi chung), picker 1 chạm, định dạng, cột, lọc/sắp xếp/tìm, menu chuột phải,
   "N ô cần sửa", hoàn tác/làm lại. Port từ prototype v4 (applyEdit, pkOpen R10, setFmt, colPreset, handleXl, fixGo, Ctrl+Z). */
import { castDraft, type Draft } from 'immer';
import { AI_IDS, FIELDS, GRP } from '@/data/constants';
import { cellValue, ck, displayText, fieldById, locked, optsFor, refOf, sourceValue } from '@/lib/cell';
import { cleanText } from '@/lib/clean';
import { autofitWidth, filterKey, findMatches, hitCell, needsFix, passColFilters, selKeys, sortRows, visibleFields } from '@/lib/grid';
import type { AiFieldId, AppState, CellFormat, CellRef, FieldGroup, FieldId, FindState, Row } from '@/types';
import { getState, log, LS, lsSet, mutate, now, restoreSnap, rowsOf, toast, undoSnap } from '@/store';

type Text = Record<string, string | undefined>;

/* ---------- dòng & ô đang hiển thị ---------- */
/** Dòng đang hiện trên bảng: ô tìm nhanh, lọc "dòng cần sửa", lọc cột, lọc theo kết quả tìm. */
export function gridRows(s: AppState): Row[] {
  const q = s.search.trim().toLowerCase(), F = s.find, vf = visibleFields(s.hidden);
  return rowsOf(s).filter((r) => {
    if (q && (r.ma + ' ' + r.viec).toLowerCase().indexOf(q) < 0) return false;
    if (s.onlyFix && !needsFix(r, s)) return false;
    if (!passColFilters(r, s.colFilter, s)) return false;
    return !(F.open && F.filter && F.q.trim() && !vf.some((f) => hitCell(r, f, F, s, s.sel?.f)));
  });
}
/** Thứ tự dòng trên bảng (theo nhóm dự án, đã sắp xếp; nhóm đang gập không có dòng). */
export function gridOrder(s: AppState): number[] {
  const list = gridRows(s), out: number[] = [];
  s.groups.forEach((g) => { if (!s.collapsed[g.k]) sortRows(list.filter((r) => r.g === g.k), s.sort, s).forEach((r) => out.push(r.i)); });
  return out;
}
const navFields = (s: AppState): FieldId[] => visibleFields(s.hidden).map((f) => f.id);
const keysOf = (s: AppState): string[] => selKeys(s.sel, s.range, gridOrder(s), navFields(s));

/* ---------- sửa ô: một đường ghi duy nhất (sửa tay, nhập tay, AI) ---------- */
/** Ghi giá trị vào ô trong recipe; `''` = về theo nguồn (cột Jira/rổ gom) hoặc xoá (cột nhập tay/AI). `true` nếu bảng đổi. */
export function editCell(d: Draft<AppState>, i: number, fid: FieldId, v0: string | null | undefined): boolean {
  const r = d.allRows[i], f = fieldById(fid);
  if (!r || !f || locked(f)) return false;
  const v = String(v0 ?? '').trim(), where = r.ma + ' · ' + f.col + ' ' + f.name;
  if (f.kind === 'ai') {
    const k = fid as AiFieldId, a = r.ai[k];
    if ((a && a.text === v && a.ok) || (!a && !v)) return false;
    if (v) r.ai[k] = { text: v, ok: true, why: a ? a.why : 'người dùng nhập', src: a ? a.src : '' };
    else delete r.ai[k];
    log(d, a ? 'Sửa nội dung AI' : 'Nhập tay ô AI', where, v ? 'Lưu và duyệt' : 'Xoá nội dung');
  } else if (f.kind === 'manual') {
    if (v && f.opts && !f.opts.includes(v)) { toast(d, 'Cột ' + f.col + ' chỉ nhận giá trị trong danh sách: ' + f.opts.join(', ')); return false; }
    const t = r as unknown as Text;
    if ((t[fid] || '') === v) return false;
    t[fid] = v;
    log(d, 'Sửa ô', where, v ? 'Đặt giá trị ' + v : 'Xoá giá trị');
  } else {
    const src = sourceValue(r, f, d), cur = cellValue(r, f, d) || '';
    if (v === cur) return false;
    if (!v || v === src) { delete r.ovr[fid]; log(d, 'Khôi phục theo nguồn', where, 'Bỏ giá trị sửa tay'); }
    else { r.ovr[fid] = v; log(d, 'Sửa tay ô lấy từ nguồn', where, (src ? 'Nguồn ghi “' + src + '”' : 'Nguồn trống') + ' → “' + v + '” · ghi vào Note'); }
  }
  d.touched[ck(i, fid)] = 1;
  if (!d.svflash.includes(ck(i, fid))) d.svflash.push(ck(i, fid));
  return true;
}

export function applyEdit(i: number, fid: FieldId, v: string): boolean {
  let ok = false;
  mutate((d) => { ok = editCell(d, i, fid, v); });
  return ok;
}

/** Chọn trong dropdown #pkPop. `''` = "Theo Jira" (cột có nguồn: bỏ sửa tay) hoặc "Bỏ giá trị" (cột nhập tay). */
export function pkPick(i: number, fid: FieldId, v: string): void {
  mutate((d) => { d.sel = { i, f: fid }; d.pk = null; editCell(d, i, fid, v); });
}
/** Mở dropdown chọn 1 chạm cho ô danh sách (bấm ô, mũi tên ▾, "Chọn … ▾", F2 / gõ chữ). `false` nếu ô không chọn được. */
export function pkOpen(i: number, fid: FieldId): boolean {
  if (!pkCanPick(fid)) return false;
  mutate((d) => { d.sel = { i, f: fid }; d.range = null; d.pk = { i, f: fid }; d.ctx = null; d.fpop = null; });
  return true;
}
export function pkClose(): void { mutate((d) => { d.pk = null; }); }

/** "Khôi phục theo nguồn" trên thanh fx. */
export function revertCell(): void {
  mutate((d) => {
    const s = d.sel; if (!s) return;
    const r = d.allRows[s.i];
    delete r.ovr[s.f];
    log(d, 'Khôi phục theo nguồn', r.ma + ' · ' + fieldById(s.f)!.col, 'Bỏ giá trị sửa tay');
  });
}

/** "Duyệt ô này": duyệt các nháp AI trong vùng đang chọn. */
export function approveSel(): void {
  const ks = keysOf(getState());
  mutate((d) => {
    let n = 0;
    ks.forEach((x) => { const [i, f] = x.split('|'), a = d.allRows[+i].ai[f as AiFieldId]; if (a && !a.ok) { a.ok = true; n++; } });
    if (n) { log(d, 'Duyệt nội dung AI', n + ' ô', 'Ghi vào ô'); toast(d, 'Đã duyệt ' + n + ' ô AI'); }
  });
}

/** Vùng đang chọn theo chỉ số dòng trong `O` (thứ tự bảng) và cột trong `F` (cột đang hiện). */
export function rangeBox(s: AppState): { r1: number; r2: number; c1: number; c2: number; O: number[]; F: FieldId[] } | null {
  if (!s.sel) return null;
  const O = gridOrder(s), F = navFields(s), a = s.range ? s.range.a : s.sel, b = s.range ? s.range.b : s.sel;
  const ra = O.indexOf(a.i), rb = O.indexOf(b.i), ca = F.indexOf(a.f), cb = F.indexOf(b.f);
  return { r1: Math.min(ra, rb), r2: Math.max(ra, rb), c1: Math.min(ca, cb), c2: Math.max(ca, cb), O, F };
}
/** Chép giá trị dòng nguồn (lặp vòng) sang các dòng đích; bỏ qua ô khoá / tính sẵn / ngoài danh sách. */
function fillCells(d: Draft<AppState>, src: number[], dst: number[], cols: FieldId[]): { ok: number; skip: number } {
  let ok = 0, skip = 0;
  cols.forEach((fid) => {
    const f = fieldById(fid)!;
    dst.forEach((i, k) => {
      const v = displayText(d.allRows[src[k % src.length]], f, d);
      if (locked(f) || ['calc', 'none', 'future', 'past'].includes(f.kind)) { skip++; return; }
      if (editCell(d, i, fid, v)) ok++; else if (displayText(d.allRows[i], f, d) !== v) skip++;
    });
  });
  return { ok, skip };
}
const skipTxt = (n: number): string => (n ? ' · bỏ qua ' + n + ' ô khoá hoặc ngoài danh sách' : '');

/** Chép xuống (Ctrl+D): một dòng thì chép từ ô ngay trên, nhiều dòng thì chép dòng đầu vùng xuống. */
export function fillDown(): void {
  const B = rangeBox(getState()); if (!B) return;
  const { r1, r2, O } = B, cols = B.F.slice(B.c1, B.c2 + 1);
  mutate((d) => {
    if (r1 === r2 && r1 === 0) return toast(d, 'Không có ô phía trên để chép xuống');
    const res = fillCells(d, r1 === r2 ? [O[r1 - 1]] : [O[r1]], r1 === r2 ? [O[r1]] : O.slice(r1 + 1, r2 + 1), cols);
    log(d, 'Chép xuống (Ctrl+D)', cols.length + ' cột', res.ok + ' ô');
    toast(d, res.ok ? 'Đã chép xuống ' + res.ok + ' ô' + skipTxt(res.skip) : 'Không có ô nào sửa được trong vùng này');
  });
}

/** Kéo tay nắm điền tới dòng thứ `r` của bảng (xuống dưới vùng hoặc lên trên), rồi chọn cả vùng đã điền. */
export function fillTo(r: number): void {
  const B = rangeBox(getState()); if (!B) return;
  const { r1, r2, c1, c2, O, F } = B, cols = F.slice(c1, c2 + 1), src = O.slice(r1, r2 + 1);
  const dst = r > r2 ? O.slice(r2 + 1, r + 1) : r < r1 ? O.slice(r, r1).reverse() : [];
  if (!dst.length) return;
  mutate((d) => {
    const res = fillCells(d, r < r1 ? src.slice().reverse() : src, dst, cols);
    d.range = { a: { i: r < r1 ? O[r] : O[r1], f: F[c1] }, b: { i: r < r1 ? O[r2] : O[r], f: F[c2] } };
    log(d, 'Kéo điền', cols.length + ' cột · ' + dst.length + ' dòng', res.ok + ' ô');
    toast(d, res.ok ? 'Đã điền ' + res.ok + ' ô' + skipTxt(res.skip) : 'Không có ô nào sửa được');
  });
}

/* ---------- chọn & di chuyển ---------- */
export function selectCell(i: number, f: FieldId, extend = false): void {
  mutate((d) => {
    if (extend && d.sel) d.range = { a: d.range ? d.range.a : { i: d.sel.i, f: d.sel.f }, b: { i, f } };
    else { d.sel = { i, f }; d.range = null; }
    d.navScroll = true;
  });
}

/** Mũi tên / Enter / Tab: dời ô chọn `dr` dòng, `dc` cột trong bảng đang hiện. */
export function move(dr: number, dc: number): void {
  const s = getState(), O = gridOrder(s), F = navFields(s), c = s.sel;
  if (!c || !O.length) return;
  const ri = Math.max(0, Math.min(O.length - 1, O.indexOf(c.i) + dr)), ci = Math.max(0, Math.min(F.length - 1, F.indexOf(c.f) + dc));
  selectCell(O[ri], F[ci]);
}

/** Ô địa chỉ #refbox: "AT12" (cột + dòng của file mẫu) hoặc mã dự án "I.A.4.1". */
export function gotoRef(text: string): boolean {
  const s = getState(), t = String(text || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return false;
  const m = /^([A-Z]{1,2})(\d{1,4})$/.exec(t);
  const r = m ? s.allRows.find((x) => String(x.tplRow) === m[2] && !x.isNew) : rowsOf(s).find((x) => x.ma.toUpperCase() === t);
  const f = m ? FIELDS.find((x) => x.col === m[1]) : fieldById('viec');
  if (!r || !f) { mutate((d) => toast(d, 'Không tìm thấy ô ' + text + ' — gõ dạng AT12 hoặc mã dự án I.A.4.1')); return false; }
  mutate((d) => {
    d.collapsed[r.g] = false; delete d.hidden[f.id];
    (Object.keys(d.colFilter) as FieldId[]).forEach((k) => { if (!d.colFilter[k]![filterKey(r, fieldById(k)!, d)]) delete d.colFilter[k]; });
    d.sel = { i: r.i, f: f.id }; d.range = null; d.navScroll = false; d.findScroll = true;
  });
  return true;
}

/** Nhấp đúp / F2 để sửa: ô danh sách mở dropdown #pkPop, ô chữ mở khung soạn #pe (`val`: chữ vừa gõ); ô khoá chỉ báo lý do. */
export function startEdit(i: number, fid: FieldId, val?: string): void {
  mutate((d) => {
    const f = fieldById(fid)!;
    d.sel = { i, f: fid }; d.range = null;
    if (f.key || f.kind === 'cfg') return;
    if (locked(f)) return toast(d, f.kind === 'future' ? 'Khối tuần chưa tới — để trống' : f.kind === 'none' ? 'Cột X trong mẫu không dùng' : 'Khối tuần đã chốt — không sửa');
    if (optsFor(f)) { d.pk = { i, f: fid }; return; }
    const r = d.allRows[i], cur = f.kind === 'ai' ? r.ai[fid as AiFieldId]?.text || '' : cellValue(r, f, d) || '';
    d.pe = { i, f: fid, val: val ?? cur, raw: false, auto: d.peAuto };
    d.find.focus = false;
  });
}

/* ---------- định dạng ô ---------- */
type FmtProp = keyof CellFormat | 'clear';
const FMT_NAME: Record<FmtProp, string> = { b: 'In đậm', i: 'In nghiêng', u: 'Gạch chân', s: 'Gạch ngang', color: 'Màu chữ', fill: 'Màu nền', clear: 'Xoá định dạng', ha: 'Căn ngang', va: 'Căn dọc' };

/** B/I/U/S bật tắt; màu chữ/nền/căn lề đặt giá trị (`null` = bỏ); `clear` xoá hết. */
export function setFmt(prop: FmtProp, val: string | null = null): boolean {
  const s = getState(), ks = keysOf(s);
  if (!ks.length) { mutate((d) => toast(d, 'Chọn ô trước khi định dạng')); return false; }
  const toggle = ['b', 'i', 'u', 's'].includes(prop);
  const on: boolean | string | null = toggle ? !ks.every((x) => (s.fmt[x] as Record<string, unknown> | undefined)?.[prop]) : val;
  mutate((d) => {
    ks.forEach((x) => {
      let o: Record<string, unknown> = { ...(d.fmt[x] || {}) };
      if (prop === 'clear') o = {};
      else if (on) o[prop] = on; else delete o[prop];
      if (Object.keys(o).length) d.fmt[x] = o as CellFormat; else delete d.fmt[x];
    });
    log(d, 'Định dạng ô', ks.length + ' ô', FMT_NAME[prop] + (toggle ? (on ? ' · bật' : ' · tắt') : val ? ' · ' + val : ''));
  });
  return true;
}

/** Căn lề; trái / giữa (dọc) là mặc định nên bỏ thuộc tính. */
export function setAlign(p: 'ha' | 'va', v: string): boolean {
  return setFmt(p, (p === 'ha' && v === 'left') || (p === 'va' && v === 'middle') ? null : v);
}

/** ↵ Xuống dòng cho các ô đang chọn (hoặc ô của menu chuột phải). */
export function toggleWrap(keys?: string[]): void {
  const s = getState(), ks = keys || (s.sel ? keysOf(s) : []);
  if (!ks.length) return;
  const on = !ks.every((x) => s.wrap[x]);
  mutate((d) => { ks.forEach((x) => { if (on) d.wrap[x] = true; else delete d.wrap[x]; }); d.ctx = null; });
}

/* ---------- phóng to & cao dòng (lưu pmo-proto-grid-v1) ---------- */
const gxSave = (): void => { lsSet(LS.grid, JSON.stringify(getState().gx)); };
/* ẩn/hiện cột và ghim cột Công việc nhớ giữa các lần mở (prototype saveCols) */
const colsSave = (): void => { const s = getState(); lsSet(LS.cols, JSON.stringify({ hidden: s.hidden, pin: s.pinViec })); };
/** `dz` ±10 phóng to/thu nhỏ (50–200%), `0` về 100%. */
export function setZoom(dz: number): void {
  mutate((d) => { d.gx.zoom = dz ? Math.max(50, Math.min(200, d.gx.zoom + dz)) : 100; });
  gxSave();
}
/** Cao dòng kéo tay; `null` (nhấp đúp mép) về mặc định. */
export function setRowHeight(i: number, h: number | null): void {
  mutate((d) => { if (h) d.gx.rowH[i] = Math.round(h); else delete d.gx.rowH[i]; });
  gxSave();
}

/* ---------- cột: ẩn/hiện, khối cột, xem nhanh, ghim ---------- */
function dropHiddenSel(d: Draft<AppState>): void { if (d.sel && d.hidden[d.sel.f]) { d.sel = null; d.range = null; } }

/** Bật/tắt một cột; `hide` = nút con mắt trên đầu cột (luôn ẩn, có thông báo). */
export function toggleCol(fid: FieldId, hide = false): void {
  const f = fieldById(fid);
  if (!f || f.key) return;
  mutate((d) => {
    if (hide || !d.hidden[fid]) d.hidden[fid] = true; else delete d.hidden[fid];
    dropHiddenSel(d);
    if (hide) toast(d, 'Đã ẩn cột “' + f.name + '” — bấm “Cột” để hiện lại');
  });
  colsSave();
}

/** Dải "Khối cột": còn cột nào đang hiện thì ẩn cả khối, không thì hiện cả khối. */
export function grpTog(g: FieldGroup): void {
  const fs = FIELDS.filter((f) => f.grp === g && !f.key);
  mutate((d) => {
    const anyShown = !fs.every((f) => d.hidden[f.id]);
    fs.forEach((f) => { if (anyShown) d.hidden[f.id] = true; else delete d.hidden[f.id]; });
    toast(d, (anyShown ? 'Đã ẩn ' : 'Đã hiện ') + 'khối ' + GRP[g].split(' · ')[0] + ' · ' + fs.length + ' cột');
  });
}

export type ColPreset = 'all' | 'week' | 'review' | 'info' | 'jira';
/** "Xem nhanh": Đủ 49 cột / Tuần này / Cột cần rà / Thông tin dự án / Chỉ cột từ Jira. */
export function colPreset(p: ColPreset): void {
  mutate((d) => {
    FIELDS.forEach((c) => {
      if (c.key || c.id === 'viec') { delete d.hidden[c.id]; return; }
      const show = (p === 'all' && c.kind !== 'none')
        || (p === 'jira' && ['jira', 'bucket', 'calc'].includes(c.kind))
        || (p === 'review' && (c.kind === 'manual' || c.kind === 'ai' || c.grp === 'w3'))
        || (p === 'week' && (['mang', 'tt', 'td', 'tt1', 'giatri', 'rui', 'action', 'nextstep', 'buoc', 'buocso'].includes(c.id) || c.grp === 'w3'))
        || (p === 'info' && ['info', 'org'].includes(c.grp) && c.kind !== 'none')
        || (p === 'info' && ['caitien', 'prio', 'loai', 'link', 'domain', 'market'].includes(c.id));
      if (show) delete d.hidden[c.id]; else d.hidden[c.id] = true;
    });
    dropHiddenSel(d); d.menu = null;
  });
  colsSave();
}

export function togglePin(): void { mutate((d) => { d.pinViec = !d.pinViec; }); colsSave(); }

/* ---------- khung "Cấu hình mẫu" (prototype tvSetHidden / tvSetWeeks L8143-8153) ---------- */
function setHid(d: Draft<AppState>, ids: readonly FieldId[], hide: boolean): void {
  ids.forEach((id) => { const f = fieldById(id); if (!f || f.key) return; if (hide) d.hidden[id] = true; else delete d.hidden[id]; });
  dropHiddenSel(d);
}
export const tvGrpIds = (g: FieldGroup): FieldId[] => FIELDS.filter((f) => f.grp === g).map((f) => f.id);
/** Hiện hết / ẩn hết một khối cột, bật / tắt khối Tuần 4/11. */
export function tvSetHidden(ids: readonly FieldId[], hide: boolean): void { mutate((d) => setHid(d, ids, hide)); colsSave(); }
/** Số tuần trong báo cáo: 1 = chỉ tuần này, 2 = thêm Tuần 02/11, 3 = thêm Tuần 01/11. */
export function tvSetWeeks(n: 1 | 2 | 3): void {
  mutate((d) => { setHid(d, tvGrpIds('w1'), n < 3); setHid(d, tvGrpIds('w2'), n < 2); setHid(d, tvGrpIds('w3'), false); });
  colsSave();
}

/* ---------- dòng, nhóm, tìm nhanh, menu ---------- */
export function toggleGroup(g: string): void { mutate((d) => { d.collapsed[g] = !d.collapsed[g]; }); }
export function toggleRowSel(i: number): void { mutate((d) => { if (d.rowSel[i]) delete d.rowSel[i]; else d.rowSel[i] = true; }); }
export function setSearch(q: string): void { mutate((d) => { d.search = q; }); }
export function toggleOnlyFix(): void { mutate((d) => { d.onlyFix = !d.onlyFix; }); }
/** Mở/đóng menu (cùng tên thì đóng); `null` đóng mọi menu. */
export function setMenu(m: string | null): void { mutate((d) => { d.menu = m && d.menu !== m ? m : null; }); }

/* ---------- "N ô cần sửa →" trên dòng nhóm ---------- */
export interface FixCell { i: number; f: FieldId; why: string; proj?: boolean }
export function fixCells(s: AppState, gk: string): FixCell[] {
  const out: FixCell[] = [];
  rowsOf(s).filter((r) => r.g === gk).forEach((r) => {
    FIELDS.forEach((f) => {
      const a = r.ai[f.id as AiFieldId];
      if (f.required && f.kind !== 'ai' && cellValue(r, f, s) === null) out.push({ i: r.i, f: f.id, why: 'ô bắt buộc còn trống — nhấp đúp để nhập' });
      else if (f.kind === 'ai' && a && !a.ok) out.push({ i: r.i, f: f.id, why: 'nháp AI chờ duyệt — nhấp đúp để duyệt' });
      else if (f.kind === 'ai' && f.required && !a) out.push({ i: r.i, f: f.id, why: 'chưa có nội dung — nhấp đúp để nhập' });
    });
    if (r.stages.includes('miss')) out.push({ i: r.i, f: 'ma', why: 'giai đoạn thiếu Subtask — bấm mã dự án để xem', proj: true });
  });
  return out;
}
/** Tới ô cần sửa kế tiếp của nhóm (vòng lại từ đầu); `fxTip` là nhãn "Ô k/n · lý do" bám theo ô. */
export function fixGo(gk: string): void {
  mutate((d) => {
    const L = fixCells(d, gk);
    if (!L.length) { d.fxTip = null; return toast(d, 'Nhóm này không còn ô cần sửa'); }
    const k = d.fixPos[gk] === undefined ? 0 : (d.fixPos[gk] + 1) % L.length, c = L[k];
    d.fixPos[gk] = k;
    delete d.hidden[c.f]; delete d.collapsed[gk];
    d.view = 'grid'; d.range = null; d.sel = { i: c.i, f: c.f }; d.scrollSel = true;
    d.fxTip = { k, n: L.length, i: c.i, f: c.f, why: c.why };
  });
}
export function fxTipClose(): void { mutate((d) => { d.fxTip = null; }); }

/* ---------- hoàn tác / làm lại (100 bước) ---------- */
function go(dir: -1 | 1): void {
  const s = getState(), from = dir < 0 ? s.undoStack : s.redoStack;
  mutate((d) => {
    if (!from.length) return toast(d, dir < 0 ? 'Không còn thao tác để hoàn tác' : 'Không còn thao tác để làm lại');
    const tgt = from[from.length - 1];
    (dir < 0 ? d.undoStack : d.redoStack).pop();
    const ok = restoreSnap(d, tgt);
    if (ok) {
      (dir < 0 ? d.redoStack : d.undoStack).push(castDraft(undoSnap(s)));
      log(d, dir < 0 ? 'Hoàn tác (Ctrl+Z)' : 'Làm lại (Ctrl+Y)', 'Bảng', 'Quay về thao tác trước đó');
    }
    d.menu = null;
    toast(d, ok ? (dir < 0 ? 'Đã hoàn tác' : 'Đã làm lại') : 'Không thể hoàn tác sau khi dữ liệu đổi');
  }, { track: false });
}
export const undo = (): void => go(-1);
export const redo = (): void => go(1);

/* ---------- lọc & sắp xếp theo cột ---------- */
/** Chuẩn hoá để so khớp không dấu, không phân biệt hoa/thường. */
export const vnorm = (s: string): string => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Các giá trị (dòng đầu, tối đa 80 ký tự) của cột kèm số dòng; "(Trống)" xuống cuối. */
export function fltValues(s: AppState, fid: FieldId): { k: string; n: number }[] {
  const f = fieldById(fid)!, cnt: Record<string, number> = {}, order: string[] = [];
  rowsOf(s).forEach((r) => { const k = filterKey(r, f, s); if (!(k in cnt)) { cnt[k] = 0; order.push(k); } cnt[k]++; });
  order.sort((a, b) => (a === '(Trống)' ? 1 : b === '(Trống)' ? -1 : a.localeCompare(b, 'vi', { numeric: true })));
  return order.map((k) => ({ k, n: cnt[k] }));
}
export function fltOpen(fid: FieldId): void {
  const s = getState(), cur = s.colFilter[fid], pick: Record<string, boolean> = {};
  fltValues(s, fid).forEach((v) => { pick[v.k] = cur ? !!cur[v.k] : true; });
  mutate((d) => { d.fpop = { f: fid, q: '', pick, focus: true }; d.ctx = null; d.menu = null; });
}
export function fltPick(v: string, on: boolean): void { mutate((d) => { if (d.fpop) d.fpop.pick[v] = on; }); }
/** Chọn / bỏ tất cả giá trị đang khớp ô tìm trong bộ lọc. */
export function fltAll(on: boolean): void {
  const s = getState(), P = s.fpop; if (!P) return;
  const q = vnorm(P.q || ''), ks = fltValues(s, P.f).filter((v) => !q || vnorm(v.k).indexOf(q) >= 0).map((v) => v.k);
  mutate((d) => { ks.forEach((k) => { d.fpop!.pick[k] = on; }); });
}
export function fltSetQ(q: string): void { mutate((d) => { if (d.fpop) { d.fpop.q = q; d.fpop.focus = true; } }); }
export function fltApply(): void {
  const s = getState(), P = s.fpop; if (!P) return;
  const vals = fltValues(s, P.f), on: Record<string, 1> = {};
  vals.forEach((v) => { if (P.pick[v.k]) on[v.k] = 1; });
  const n = Object.keys(on).length, f = fieldById(P.f)!;
  mutate((d) => {
    if (n === vals.length) delete d.colFilter[P.f]; else d.colFilter[P.f] = on;
    d.fpop = null;
    toast(d, n === vals.length ? 'Bỏ lọc cột ' + f.col : 'Lọc cột ' + f.col + ' · ' + n + '/' + vals.length + ' giá trị');
  });
}
export function fltClear(fid: FieldId): void { mutate((d) => { delete d.colFilter[fid]; d.fpop = null; }); }
export function fltClearAll(): void { mutate((d) => { d.colFilter = {}; toast(d, 'Đã bỏ mọi bộ lọc cột'); }); }
export function fltClose(): void { mutate((d) => { d.fpop = null; }); }

/** Sắp xếp trong từng nhóm dự án; `null` bỏ sắp xếp. */
export function sortCol(fid: FieldId, dir: 'asc' | 'desc' | null): void {
  mutate((d) => {
    d.sort = dir ? { f: fid, dir } : null; d.fpop = null; d.ctx = null;
    if (dir) toast(d, 'Sắp xếp theo ' + fieldById(fid)!.col + ' ' + (dir === 'asc' ? 'A → Z' : 'Z → A') + ' trong từng nhóm dự án');
  });
}
export function sortClear(): void { mutate((d) => { d.sort = null; }); }

/* ---------- tìm trong bảng (Ctrl+F) ---------- */
export function findOpen(): void { mutate((d) => { d.find.open = true; d.find.focus = true; d.menu = null; }); }
export function findClose(): void { mutate((d) => { d.find.open = false; d.find.all = false; d.find.filter = false; }); }
/** Gõ từ khoá / bật Aa, nguyên từ, phạm vi, lọc dòng khớp. */
export function findSet(patch: Partial<FindState>): void { mutate((d) => { Object.assign(d.find, patch); }); }

function findJump(d: Draft<AppState>, m: CellRef): void {
  d.collapsed[d.allRows[m.i].g] = false; delete d.hidden[m.f];
  d.sel = { i: m.i, f: m.f }; d.range = null; d.findScroll = true; d.find.listTo = true;
}
/** Enter / F3: tới kết quả kế (`1`) hoặc trước (`-1`). */
export function findGo(step: 1 | -1): void {
  const s = getState(), list = findMatches(s, rowsOf(s));
  mutate((d) => {
    d.find.focus = true;
    if (!list.length) { d.find.idx = -1; return; }
    const cur = s.sel ? list.findIndex((m) => m.i === s.sel!.i && m.f === s.sel!.f) : -1;
    d.find.idx = cur < 0 ? (step > 0 ? 0 : list.length - 1) : (cur + step + list.length) % list.length;
    findJump(d, list[d.find.idx]);
  });
}
/** Bấm một dòng trong danh sách kết quả. */
export function findPick(k: number): void {
  const s = getState(), m = findMatches(s, rowsOf(s))[k];
  if (!m) return;
  mutate((d) => { findJump(d, m); d.find.idx = k; d.find.listTo = false; });
}

/* ---------- menu chuột phải ---------- */
export function ctxOpen(x: number, y: number, i: number, f: FieldId): void {
  const s = getState(), inRange = !!s.range && keysOf(s).includes(ck(i, f));
  mutate((d) => {
    if (!inRange) { d.sel = { i, f }; d.range = null; }
    d.ctx = { x, y, i, f, t: now().getTime() }; d.fpop = null;
  });
}
export function ctxClose(): void { mutate((d) => { d.ctx = null; }); }
/** "Xoá nội dung ô". */
export function ctxClear(): void {
  mutate((d) => { const C = d.ctx; if (!C) return; d.ctx = null; if (editCell(d, C.i, C.f, '')) toast(d, 'Đã xoá nội dung ô'); });
}
/** "Lọc theo giá trị này". */
export function ctxFilterVal(): void {
  mutate((d) => {
    const C = d.ctx; if (!C) return;
    const f = fieldById(C.f)!, k = filterKey(d.allRows[C.i], f, d);
    d.colFilter[C.f] = { [k]: 1 }; d.ctx = null;
    toast(d, 'Lọc cột ' + f.col + ' = “' + k.slice(0, 40) + '”');
  });
}

/** Ô danh sách: có dropdown #pkPop không (cột hệ thống/khoá thì không). */
export const pkCanPick = (fid: FieldId): boolean => { const f = fieldById(fid); return !!f && !!optsFor(f) && !locked(f) && f.kind !== 'cfg'; };

/* ---------- thao tác giao diện bảng (Task 7, R4): kéo chọn, phím, khung soạn, rộng cột, chọn dòng ---------- */
const clamp = (v: number, n: number): number => Math.max(0, Math.min(n - 1, v));

/** Kéo chuột chọn vùng (selDrag): ô neo `a`, ô đang trỏ `b`. */
export function selectRange(a: CellRef, b: CellRef): void {
  mutate((d) => { d.sel = { i: a.i, f: a.f }; d.range = { a, b }; });
}
/** Mũi tên: dời ô chọn; Shift giữ ô neo và nới vùng. */
export function arrow(dr: number, dc: number, extend: boolean): void {
  const s = getState(), O = gridOrder(s), F = navFields(s), c = s.sel;
  if (!c || !O.length) return;
  const cur = extend && s.range ? s.range.b : c, nx = { i: O[clamp(O.indexOf(cur.i) + dr, O.length)], f: F[clamp(F.indexOf(cur.f) + dc, F.length)] };
  mutate((d) => {
    if (extend) d.range = { a: d.range ? d.range.a : { i: c.i, f: c.f }, b: nx };
    else { d.sel = nx; d.range = null; }
    d.navScroll = true;
  });
}
/** Ctrl+mũi tên: ô ở mép vùng có dữ liệu theo hướng (dr, dc), như Excel. */
export function edgeJump(s: AppState, dr: number, dc: number): CellRef | null {
  const cur = s.range ? s.range.b : s.sel, O = gridOrder(s), F = navFields(s);
  if (!cur || O.indexOf(cur.i) < 0 || F.indexOf(cur.f) < 0) return null;
  const at = (r: number, c: number): boolean => !!displayText(s.allRows[O[r]], fieldById(F[c])!, s).trim();
  const inb = (r: number, c: number): boolean => r >= 0 && r < O.length && c >= 0 && c < F.length;
  let r = O.indexOf(cur.i), c = F.indexOf(cur.f);
  if (inb(r + dr, c + dc) && at(r, c) && at(r + dr, c + dc)) { while (inb(r + dr, c + dc) && at(r + dr, c + dc)) { r += dr; c += dc; } }
  else { r += dr; c += dc; while (inb(r, c) && !at(r, c)) { r += dr; c += dc; } if (!inb(r, c)) { r -= dr; c -= dc; } }
  return { i: O[clamp(r, O.length)], f: F[clamp(c, F.length)] };
}
/** Esc trên bảng: bỏ vùng chọn, đóng menu. */
export function escGrid(): void { mutate((d) => { d.range = null; d.menu = null; }); }
/** Delete / Backspace: xoá ô đang chọn (một ô, không khoá). */
export function clearCell(): boolean {
  const s = getState(), c = s.sel;
  return !!c && !s.range && !locked(fieldById(c.f)!) && applyEdit(c.i, c.f, '');
}
/** Gõ một chữ trên ô đang chọn: ô chữ mở khung soạn với chữ đó, ô danh sách nhảy tới giá trị bắt đầu bằng chữ đó. */
export function typeKey(k: string): void {
  const s = getState(), c = s.sel; if (!c || s.range) return;
  const f = fieldById(c.f)!, opts = optsFor(f);
  if (locked(f) || ['calc', 'none', 'future', 'past'].includes(f.kind)) {
    return mutate((d) => toast(d, f.kind === 'cfg' ? 'Cột ' + f.col + ' lấy từ Dữ liệu hệ thống — nhấp đúp để gửi yêu cầu sửa' : 'Ô ' + f.col + ' không sửa trên bảng'));
  }
  if (!opts) return startEdit(c.i, c.f, k);
  const cur = displayText(s.allRows[c.i], f, s), start = Math.max(0, opts.indexOf(cur) + 1);
  const hit = opts.slice(start).concat(opts.slice(0, start)).find((o) => vnorm(o).charAt(0) === vnorm(k));
  if (!hit || f.kind !== 'manual') return startEdit(c.i, c.f);
  mutate((d) => { editCell(d, c.i, c.f, hit); toast(d, f.col + ' = ' + hit + ' · gõ tiếp chữ đó để đổi giá trị khác'); });
}
/** Đã cuộn tới ô (tìm / di chuyển / "N ô cần sửa"): hạ cờ cuộn. */
export function scrollDone(): void { mutate((d) => { d.findScroll = false; d.navScroll = false; d.scrollSel = false; }); }

/* khung soạn ô #pe */
export function peClose(): void { mutate((d) => { d.pe = null; }); }
/** "Xem bản gốc" / "Ẩn bản gốc" (giữ chữ đang gõ). */
export function peToggleRaw(val: string): void { mutate((d) => { if (d.pe) { d.pe.raw = !d.pe.raw; d.pe.val = val; } }); }
export function peSetAuto(on: boolean): void { mutate((d) => { d.peAuto = on; if (d.pe) d.pe.auto = on; }); }
/** Lưu (Ctrl+Enter): tự làm gọn nếu bật; nội dung giữ nguyên trên ô nháp AI thì duyệt nháp. */
export function peSave(text: string): void {
  mutate((d) => {
    const P = d.pe; if (!P) return;
    const f = fieldById(P.f)!, r = d.allRows[P.i], auto = P.auto, v = auto ? cleanText(text) : text;
    let changed = editCell(d, P.i, P.f, v);
    const a = f.kind === 'ai' ? r.ai[P.f as AiFieldId] : undefined;
    if (!changed && a && !a.ok) { a.ok = true; log(d, 'Duyệt nháp AI', r.ma + ' · ' + f.col + ' ' + f.name, 'Giữ nguyên nội dung'); changed = true; }
    d.pe = null;
    toast(d, changed ? 'Đã lưu ô ' + refOf(r, f) + (auto && v !== text.trim() ? ' · đã làm gọn định dạng' : '') : 'Không có thay đổi');
  });
}

export function svflashClear(): void { mutate((d) => { d.svflash = []; }); }

/** Kéo mép cột (`null` = về độ rộng mặc định). Lưu cùng pmo-proto-grid-v1. */
export function setColW(fid: FieldId, w: number | null): void {
  mutate((d) => { if (w) d.gx.colW[fid] = Math.round(w); else delete d.gx.colW[fid]; });
  gxSave();
}
/** Nhấp đúp mép cột / "Vừa độ rộng cột theo nội dung": `measure` đo chữ (canvas, do giao diện cung cấp). */
export function autofitCol(fid: FieldId, measure: (t: string) => number): void {
  const s = getState(), f = fieldById(fid); if (!f) return;
  const w = autofitWidth(f, rowsOf(s), s, measure);
  mutate((d) => { d.gx.colW[fid] = w; d.ctx = null; toast(d, 'Cột ' + f.col + ' vừa nội dung · ' + w + 'px'); });
  gxSave();
}

/* tick chọn dòng (thanh SelBar) */
export function rowSelAll(): void {
  const s = getState(), vis = rowsOf(s).filter((r) => !s.collapsed[r.g]), allOn = vis.every((r) => s.rowSel[r.i]);
  mutate((d) => { d.rowSel = {}; if (!allOn) vis.forEach((r) => { d.rowSel[r.i] = true; }); });
}
export function grpSel(g: string): void {
  const s = getState(), gl = rowsOf(s).filter((r) => r.g === g), on = gl.every((r) => s.rowSel[r.i]);
  mutate((d) => { gl.forEach((r) => { if (on) delete d.rowSel[r.i]; else d.rowSel[r.i] = true; }); });
}
export function clearRowSel(): void { mutate((d) => { d.rowSel = {}; }); }
/** "✓ Duyệt N ô của M dự án": duyệt mọi nháp AI của các dòng đang tick. */
export function approveRows(): void {
  mutate((d) => {
    const all = rowsOf(d), sr = all.filter((r) => d.rowSel[r.i]);
    let na = 0;
    sr.forEach((r) => AI_IDS.forEach((k) => { const a = r.ai[k]; if (a && !a.ok) { a.ok = true; na++; } }));
    log(d, 'Duyệt cả dự án', sr.length === all.length ? 'Tất cả ' + sr.length + ' dự án' : sr.map((r) => r.ma).join(', '), na + ' ô AI (AC, AS, AT) duyệt một lượt');
    d.rowSel = {};
    toast(d, 'Đã duyệt ' + na + ' ô của ' + sr.length + ' dự án — vẫn sửa được từng ô trên bảng');
  });
}
export function ctxJira(): void {
  mutate((d) => { const C = d.ctx; if (!C) return; d.ctx = null; toast(d, 'Bản thật sẽ mở ' + (d.allRows[C.i].key || '') + ' trên Jira ở tab mới'); });
}

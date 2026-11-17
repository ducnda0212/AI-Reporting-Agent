import type { CellFmt } from '../types';
import { AI_IDS, FIELDS } from '@/data/constants';
import { ck, displayText, fieldOf, locked, noEdit, optsFor, selectRows, visibleFields } from '@/lib/cell';
import { cleanText, vnorm } from '@/lib/text';
import { edgeJump, findMatches, fltValues, navFields, rangeBox, refOf, rowOrder, selKeys } from '@/lib/grid';
import { applyEdit, pushLog, setToast } from '../helpers';
import { mutate, getState } from '../index';

/** Thao tác trên bảng: chọn ô, sửa, định dạng, cột, lọc/sắp xếp, điền, tìm, khung soạn ô. */

/* ---------- chọn ô / điều hướng ---------- */
export function selectCell(i: number, fid: string, extend = false) {
  mutate((d) => {
    if (extend && d.sel) d.range = { a: d.range ? d.range.a : { i: d.sel.i, f: d.sel.f }, b: { i, f: fid } };
    else { d.sel = { i, f: fid }; d.range = null; }
    d.edit = null;
    d.scrollReq = { i, f: fid, flash: false };
  });
}

export function move(dr: number, dc: number) {
  const s = getState();
  if (!s.sel) return;
  const O = rowOrder(s);
  const F = navFields(s);
  const ri = Math.max(0, Math.min(O.length - 1, O.indexOf(s.sel.i) + dr));
  const ci = Math.max(0, Math.min(F.length - 1, F.indexOf(s.sel.f) + dc));
  selectCell(O[ri], F[ci], false);
}

export function jumpEdge(dr: number, dc: number, extend: boolean) {
  const to = edgeJump(getState(), dr, dc);
  selectCell(to.i, to.f, extend);
}

export function clickCell(i: number, fid: string, shift: boolean) {
  mutate((d) => {
    if (shift && d.sel) {
      d.range = { a: d.range ? d.range.a : { i: d.sel.i, f: d.sel.f }, b: { i, f: fid } };
      return;
    }
    d.sel = { i, f: fid }; d.range = null; d.edit = null;
    if (fid === 'code') { d.panel = 'project'; d.panelRow = i; d.stage = Math.max(0, d.allRows[i].stages.indexOf('miss')); }
  });
}

export function openPE(i: number, fid: string, initial?: string) {
  mutate((d) => {
    const r = d.allRows[i];
    const f = fieldOf(d, fid);
    const cur = initial ?? (f.kind === 'ai' ? (r.ai[fid] ? r.ai[fid]!.text : '') : displayText(d, r, f));
    d.sel = { i, f: fid }; d.range = null; d.edit = null;
    d.pe = { i, f: fid, val: cur, orig: cur, raw: false, auto: d.peAuto !== false };
  });
}

/** nhấp đúp / Enter / F2: mở trình sửa phù hợp với loại ô */
export function startEdit(i: number, fid: string) {
  mutate((d) => {
    const f = fieldOf(d, fid);
    const r = d.allRows[i];
    d.sel = { i, f: fid }; d.range = null;
    if (f.key) { d.panel = 'project'; d.panelRow = i; d.stage = Math.max(0, r.stages.indexOf('miss')); return; }
    if (f.kind === 'cfg') { d.edit = null; d.view = 'cat'; d.catQ = r.code; setToast(d, 'Thông tin này lưu trên hệ thống — muốn đổi thì gửi yêu cầu sửa'); return; }
    if (locked(f)) { setToast(d, f.kind === 'future' ? 'Khối tuần chưa tới — để trống' : f.kind === 'none' ? 'Cột X trong mẫu không dùng' : 'Khối tuần đã chốt — không sửa'); return; }
    if (!optsFor(f)) { d.edit = null; return; }
    d.edit = { i, f: fid };
  });
  const s = getState();
  const f = fieldOf(s, fid);
  if (!locked(f) && !optsFor(f) && f.kind !== 'cfg') openPE(i, fid);
}

export function commitEdit(i: number, fid: string, v: string) {
  mutate((d) => { applyEdit(d, i, fid, v); d.edit = null; });
}

export function setCell(i: number, fid: string, v: string) {
  mutate((d) => { d.sel = { i, f: fid }; d.range = null; applyEdit(d, i, fid, v); });
}

export function clearCell(i: number, fid: string) {
  mutate((d) => { if (applyEdit(d, i, fid, '')) setToast(d, 'Đã xoá nội dung ô'); });
}

export function revertSel() {
  mutate((d) => {
    if (!d.sel) return;
    const r = d.allRows[d.sel.i];
    delete r.ovr[d.sel.f];
    pushLog(d, 'Khôi phục theo nguồn', `${r.code} · ${fieldOf(d, d.sel.f).col}`, 'Bỏ giá trị sửa tay');
  });
}

export function approveSel() {
  mutate((d) => {
    let n = 0;
    selKeys(d).forEach((x) => {
      const p = x.split('|');
      const dr = d.allRows[+p[0]].ai[p[1]];
      if (dr && !dr.ok) { dr.ok = true; n++; }
    });
    if (n) { pushLog(d, 'Duyệt nội dung AI', n + ' ô', 'Ghi vào ô'); setToast(d, `Đã duyệt ${n} ô AI`); }
  });
}

/* ---------- chọn dòng ---------- */
export function toggleRowSel(i: number) { mutate((d) => { if (d.rowSel[i]) delete d.rowSel[i]; else d.rowSel[i] = true; }); }
export function selAllRows() {
  mutate((d) => {
    const vis = selectRows(d).filter((r) => !d.collapsed[r.g]);
    const allOn = vis.every((r) => d.rowSel[r.i]);
    d.rowSel = {};
    if (!allOn) vis.forEach((r) => { d.rowSel[r.i] = true; });
  });
}
export function selGroup(g: string) {
  mutate((d) => {
    const gl = selectRows(d).filter((r) => r.g === g);
    const on = gl.every((r) => d.rowSel[r.i]);
    gl.forEach((r) => { if (on) delete d.rowSel[r.i]; else d.rowSel[r.i] = true; });
  });
}
export const clearRowSel = () => mutate((d) => { d.rowSel = {}; });
export const toggleGroup = (g: string) => mutate((d) => { d.collapsed[g] = !d.collapsed[g]; });

/* ---------- định dạng ô ---------- */
export function setFmt(prop: 'b' | 'i' | 'u' | 's' | 'color' | 'fill' | 'clear', val?: string | null) {
  mutate((d) => {
    const ks = selKeys(d);
    if (!ks.length) { setToast(d, 'Chọn ô trước khi định dạng'); return; }
    const toggle = ['b', 'i', 'u', 's'].includes(prop);
    const allHave = ks.every((x) => (d.fmt[x] || {})[prop as keyof CellFmt]);
    const on = toggle ? !allHave : val;
    ks.forEach((x) => {
      let o: CellFmt = { ...(d.fmt[x] || {}) };
      if (prop === 'clear') o = {};
      else if (on) (o as Record<string, unknown>)[prop] = on; else delete (o as Record<string, unknown>)[prop];
      if (Object.keys(o).length) d.fmt[x] = o; else delete d.fmt[x];
    });
    const names: Record<string, string> = { b: 'In đậm', i: 'In nghiêng', u: 'Gạch chân', s: 'Gạch ngang', color: 'Màu chữ', fill: 'Màu nền', clear: 'Xoá định dạng' };
    pushLog(d, 'Định dạng ô', ks.length + ' ô', names[prop] + (toggle ? (on ? ' · bật' : ' · tắt') : val ? ' · ' + val : ''));
    d.menu = null;
  });
}

/* ---------- cột ---------- */
export function hideCol(id: string, toggle = false) {
  mutate((d) => {
    const f = fieldOf(d, id);
    if (f.key) return;
    d.hidden[id] = toggle ? !d.hidden[id] : true;
    if (d.sel && d.hidden[d.sel.f]) { d.sel = null; d.range = null; }
    if (!toggle) setToast(d, `Đã ẩn cột “${f.name}” — bấm “Cột” để hiện lại`);
  });
}

export function colPreset(p: 'all' | 'jira' | 'review' | 'week' | 'info') {
  mutate((d) => {
    FIELDS.forEach((c) => {
      if (c.key || c.id === 'task') { delete d.hidden[c.id]; return; }
      const show = (p === 'all' && c.kind !== 'none')
        || (p === 'jira' && ['jira', 'bucket', 'calc'].includes(c.kind))
        || (p === 'review' && (c.kind === 'manual' || c.kind === 'ai' || c.grp === 'w3'))
        || (p === 'week' && (['workstream', 'status', 'progress', 'statusAlt', 'businessValue', 'riskLevel', 'action', 'nextStep', 'lifecycleStep', 'lifecycleStepNo'].includes(c.id) || c.grp === 'w3'))
        || (p === 'info' && ['info', 'org'].includes(c.grp) && c.kind !== 'none')
        || (p === 'info' && ['initiativeType', 'prio', 'projectType', 'link', 'domain', 'market'].includes(c.id));
      if (show) delete d.hidden[c.id]; else d.hidden[c.id] = true;
    });
    if (d.sel && d.hidden[d.sel.f]) { d.sel = null; d.range = null; }
    d.menu = null;
  });
}

export const setColWidth = (id: string, w: number) => mutate((d) => { fieldOf(d, id).w = Math.round(w); });

let measureCtx: CanvasRenderingContext2D | null = null;
/** vừa độ rộng cột theo nội dung dài nhất */
export function autofitCol(fid: string) {
  mutate((d) => {
    const f = fieldOf(d, fid);
    if (!f) return;
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    if (!measureCtx) return;
    measureCtx.font = '400 11.5px Inter, system-ui, sans-serif';
    let w = Math.min(160, measureCtx.measureText(f.name).width + 40);
    selectRows(d).forEach((r) => displayText(d, r, f).split('\n').forEach((l) => { w = Math.max(w, measureCtx!.measureText(l).width + 30); }));
    f.w = Math.round(Math.max(70, Math.min(480, w)));
    setToast(d, `Cột ${f.col} vừa nội dung · ${f.w}px`);
    d.ctx = null;
  });
}
export const togglePin = () => mutate((d) => { d.pinTask = !d.pinTask; });
export const toggleWrapCols = () => mutate((d) => {
  if (!d.sel) return;
  const B = rangeBox(d);
  const cols = B.F.slice(B.c1, B.c2 + 1);
  const on = !cols.every((x) => d.wrap[x]);
  cols.forEach((x) => { if (on) d.wrap[x] = true; else delete d.wrap[x]; });
});
export const toggleWrap = (fid: string) => mutate((d) => { if (d.wrap[fid]) delete d.wrap[fid]; else d.wrap[fid] = true; d.ctx = null; });

/* ---------- lọc / sắp xếp ---------- */
export function openFilter(fid: string) {
  mutate((d) => {
    const cur = d.colFilter[fid];
    const pick: Record<string, boolean> = {};
    fltValues(d, fid).forEach((v) => { pick[v.k] = cur ? !!cur[v.k] : true; });
    d.fpop = { f: fid, q: '', pick }; d.ctx = null; d.menu = null;
  });
}
export const setFilterQuery = (q: string) => mutate((d) => { if (d.fpop) d.fpop.q = q; });
export const pickFilterValue = (k: string, on: boolean) => mutate((d) => { if (d.fpop) d.fpop.pick[k] = on; });
export function pickFilterAll(on: boolean) {
  mutate((d) => {
    if (!d.fpop) return;
    const q = vnorm(d.fpop.q || '');
    fltValues(d, d.fpop.f).forEach((v) => { if (!q || vnorm(v.k).includes(q)) d.fpop!.pick[v.k] = on; });
  });
}
export function applyFilter() {
  mutate((d) => {
    const P = d.fpop;
    if (!P) return;
    const vals = fltValues(d, P.f);
    const on: Record<string, number> = {};
    let n = 0;
    vals.forEach((v) => { if (P.pick[v.k]) { on[v.k] = 1; n++; } });
    if (n === vals.length) delete d.colFilter[P.f]; else d.colFilter[P.f] = on;
    const f = fieldOf(d, P.f);
    d.fpop = null;
    setToast(d, n === vals.length ? `Bỏ lọc cột ${f.col}` : `Lọc cột ${f.col} · ${n}/${vals.length} giá trị`);
  });
}
export const clearFilter = (fid: string) => mutate((d) => { delete d.colFilter[fid]; d.fpop = null; });
export const clearAllFilters = () => mutate((d) => { d.colFilter = {}; setToast(d, 'Đã bỏ mọi bộ lọc cột'); });
export const closeFilter = () => mutate((d) => { d.fpop = null; });
export function sortCol(fid: string, dir: number) {
  mutate((d) => {
    d.sort = fid && dir ? { f: fid, dir } : null; d.fpop = null; d.ctx = null;
    if (d.sort) setToast(d, `Sắp xếp theo ${fieldOf(d, fid).col} ${dir > 0 ? 'A → Z' : 'Z → A'} trong từng nhóm dự án`);
  });
}
export function filterByCellValue(i: number, fid: string) {
  mutate((d) => {
    const f = fieldOf(d, fid);
    const k = displayText(d, d.allRows[i], f).split('\n')[0].trim().slice(0, 80) || '(Trống)';
    d.colFilter[fid] = { [k]: 1 }; d.ctx = null;
    setToast(d, `Lọc cột ${f.col} = “${k.slice(0, 40)}”`);
  });
}

/* ---------- điền (Ctrl+D, kéo tay nắm) ---------- */
function fillCells(d: ReturnType<typeof getState>, srcRows: number[], dstRows: number[], cols: string[]) {
  let ok = 0;
  let skip = 0;
  cols.forEach((fid) => {
    const f = fieldOf(d, fid);
    dstRows.forEach((i, k) => {
      const src = srcRows[k % srcRows.length];
      const v = displayText(d, d.allRows[src], f);
      if (noEdit(f)) { skip++; return; }
      if (applyEdit(d, i, fid, v)) ok++; else if (displayText(d, d.allRows[i], f) !== v) skip++;
    });
  });
  return { ok, skip };
}

export function fillDown() {
  mutate((d) => {
    if (!d.sel) return;
    const B = rangeBox(d);
    const cols = B.F.slice(B.c1, B.c2 + 1);
    let res: { ok: number; skip: number };
    if (B.r1 === B.r2) {
      if (B.r1 === 0) { setToast(d, 'Không có ô phía trên để chép xuống'); return; }
      res = fillCells(d, [B.O[B.r1 - 1]], [B.O[B.r1]], cols);
    } else res = fillCells(d, [B.O[B.r1]], B.O.slice(B.r1 + 1, B.r2 + 1), cols);
    pushLog(d, 'Chép xuống (Ctrl+D)', cols.length + ' cột', res.ok + ' ô');
    setToast(d, res.ok ? `Đã chép xuống ${res.ok} ô` + (res.skip ? ` · bỏ qua ${res.skip} ô khoá hoặc ngoài danh sách` : '') : 'Không có ô nào sửa được trong vùng này');
  });
}

/** kéo tay nắm điền từ vùng [r1..r2] tới dòng `to` (chỉ số trong rowOrder) */
export function fillDrag(to: number) {
  mutate((d) => {
    const B = rangeBox(d);
    const cols = B.F.slice(B.c1, B.c2 + 1);
    const src = B.O.slice(B.r1, B.r2 + 1);
    let dst: number[] = [];
    if (to > B.r2) dst = B.O.slice(B.r2 + 1, to + 1); else if (to < B.r1) dst = B.O.slice(to, B.r1).reverse();
    if (!dst.length) return;
    const res = fillCells(d, to < B.r1 ? src.slice().reverse() : src, dst, cols);
    d.range = {
      a: { i: to < B.r1 ? B.O[to] : B.O[B.r1], f: B.F[B.c1] },
      b: { i: to < B.r1 ? B.O[B.r2] : B.O[to], f: B.F[B.c2] },
    };
    pushLog(d, 'Kéo điền', `${cols.length} cột · ${dst.length} dòng`, res.ok + ' ô');
    setToast(d, res.ok ? `Đã điền ${res.ok} ô` + (res.skip ? ` · bỏ qua ${res.skip} ô khoá hoặc ngoài danh sách` : '') : 'Không có ô nào sửa được');
  });
}

/* ---------- ô địa chỉ ---------- */
export function gotoRef(txt: string): boolean {
  let ok = false;
  mutate((d) => {
    const t = String(txt || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!t) return;
    const m = /^([A-Z]{1,2})(\d{1,4})$/.exec(t);
    let r; let f;
    if (m) {
      f = FIELDS.find((x) => x.col === m[1]);
      r = d.allRows.find((x) => String(x.tplRow) === m[2] && !x.isNew);
    } else {
      r = selectRows(d).find((x) => x.code.toUpperCase() === t);
      f = FIELDS.find((x) => x.id === 'task');
    }
    if (!r || !f) { setToast(d, `Không tìm thấy ô ${txt} — gõ dạng AT12 hoặc mã dự án I.A.4.1`); return; }
    d.collapsed[r.g] = false; delete d.hidden[f.id];
    Object.keys(d.colFilter).forEach((k) => {
      const ff = fieldOf(d, k);
      const key = displayText(d, r!, ff).split('\n')[0].trim().slice(0, 80) || '(Trống)';
      if (!d.colFilter[k][key]) delete d.colFilter[k];
    });
    d.sel = { i: r.i, f: f.id }; d.range = null; d.edit = null;
    d.scrollReq = { i: r.i, f: f.id, flash: true };
    ok = true;
  });
  return ok;
}

/* ---------- gõ để sửa ô danh sách ---------- */
export function typeIntoCell(key: string) {
  const s = getState();
  if (!s.sel) return;
  const f = fieldOf(s, s.sel.f);
  if (noEdit(f)) {
    mutate((d) => setToast(d, f.kind === 'cfg' ? `Cột ${f.col} lấy từ Dữ liệu hệ thống — nhấp đúp để gửi yêu cầu sửa` : `Ô ${f.col} không sửa trên bảng`));
    return;
  }
  const opts = optsFor(f);
  if (opts) {
    const cur = displayText(s, s.allRows[s.sel.i], f);
    const start = Math.max(0, opts.indexOf(cur) + 1);
    const hit = opts.slice(start).concat(opts.slice(0, start)).find((o) => vnorm(o).charAt(0) === vnorm(key));
    if (hit && f.kind === 'manual') {
      mutate((d) => { applyEdit(d, s.sel!.i, s.sel!.f, hit); setToast(d, `${f.col} = ${hit} · gõ tiếp chữ đó để đổi giá trị khác`); });
    } else startEdit(s.sel.i, s.sel.f);
    return;
  }
  openPE(s.sel.i, s.sel.f, key);
}

/* ---------- tìm kiếm ---------- */
export const openFind = () => mutate((d) => { d.find.open = true; d.menu = null; });
export const closeFind = () => mutate((d) => { d.find.open = false; d.find.all = false; d.find.filter = false; });
export const setFindQuery = (q: string) => mutate((d) => { d.find.q = q; d.find.idx = -1; });
export const setFindOpt = (k: 'cs' | 'whole' | 'all' | 'filter', v: boolean) => mutate((d) => { d.find[k] = v; });
export const setFindScope = (v: 'all' | 'week' | 'col') => mutate((d) => { d.find.scope = v; });

export function findJump(k: number) {
  mutate((d) => {
    const list = findMatches(d);
    const m = list[k];
    if (!m) return;
    const r = d.allRows[m.i];
    d.collapsed[r.g] = false; delete d.hidden[m.f];
    d.sel = { i: m.i, f: m.f }; d.range = null; d.edit = null; d.find.idx = k;
    d.scrollReq = { i: m.i, f: m.f, flash: true };
  });
}
export function findGo(step: number) {
  const s = getState();
  const list = findMatches(s);
  if (!list.length) { mutate((d) => { d.find.idx = -1; }); return; }
  const cur = s.sel ? list.findIndex((m) => m.i === s.sel!.i && m.f === s.sel!.f) : -1;
  findJump(cur < 0 ? (step > 0 ? 0 : list.length - 1) : (cur + step + list.length) % list.length);
}

/* ---------- khung soạn ô (PE) ---------- */
export const closePE = () => mutate((d) => { d.pe = null; });
export const setPEVal = (v: string) => mutate((d) => { if (d.pe) d.pe.val = v; });
export const togglePERaw = () => mutate((d) => { if (d.pe) d.pe.raw = !d.pe.raw; });
export const setPEAuto = (on: boolean) => mutate((d) => { if (d.pe) d.pe.auto = on; d.peAuto = on; });

export function savePE(currentText: string) {
  mutate((d) => {
    const P = d.pe;
    if (!P) return;
    const f = fieldOf(d, P.f);
    const r = d.allRows[P.i];
    const v = P.auto ? cleanText(currentText) : currentText;
    const dr = f.kind === 'ai' ? r.ai[f.id] : undefined;
    let changed = applyEdit(d, P.i, P.f, v);
    if (!changed && dr && !dr.ok) { dr.ok = true; pushLog(d, 'Duyệt nháp AI', `${r.code} · ${f.col} ${f.name}`, 'Giữ nguyên nội dung'); changed = true; }
    d.pe = null;
    setToast(d, changed ? `Đã lưu ô ${refOf(r, f)}` + (P.auto && v !== currentText.trim() ? ' · đã làm gọn định dạng' : '') : 'Không có thay đổi');
  });
}

/* ---------- sự kiện ô ---------- */
export const clearScrollReq = () => mutate((d) => { d.scrollReq = null; });
export const cancelEdit = () => mutate((d) => { d.edit = null; });

export function onCellClick(i: number, fid: string, detail: number, shift: boolean) {
  if (detail === 2 && !shift) startEdit(i, fid); else clickCell(i, fid, shift);
}

/** Tab trong ô đang sửa: sang cột kế tiếp (hoặc trước đó) cùng dòng */
export function tabFrom(i: number, fid: string, back: boolean) {
  mutate((d) => {
    const vf = visibleFields(d).map((f) => f.id);
    const ni = Math.max(0, Math.min(vf.length - 1, vf.indexOf(fid) + (back ? -1 : 1)));
    d.sel = { i, f: vf[ni] }; d.range = null;
  });
}

export function openContext(x: number, y: number, i: number, fid: string) {
  mutate((d) => {
    const inRange = d.range && selKeys(d).includes(ck(i, fid));
    if (!inRange) { d.sel = { i, f: fid }; d.range = null; d.edit = null; }
    d.ctx = { x, y, i, f: fid }; d.fpop = null;
  });
}
export const closeContext = () => mutate((d) => { d.ctx = null; });

export { AI_IDS };

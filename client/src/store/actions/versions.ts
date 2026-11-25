/* Chốt bản, xuất Excel 49 cột, mở bản cũ sửa tiếp, danh sách & so sánh phiên bản.
   Port từ prototype v4 (doLock L5973/L10611, doExport + exXlsx, stSaveVersions, applySnap/openVersion, vlEdit L10572, vlTable3, vbPair). */
import type { Draft } from 'immer';
import { AI_IDS, FIELDS, WEEKS } from '@/data/constants';
import { locked, sourceValue } from '@/lib/cell';
import { snapshot, verEditsNow, vKey, vSnap, type Snap } from '@/lib/versions';
import { exFields, exXlsx, xlsxName } from '@/lib/xlsx';
import type { AppState, VersionItem, WeekKey } from '@/types';
import { getState, inBrowser, log, LS, lsJson, lsSet, mutate, nowStr, rowsOf, sortVersions, toast } from '@/store';
import { GOLD_FILE, loadFileNow } from './flow';

export const wkName = (k: WeekKey, short = false): string => {
  const w = WEEKS.find((x) => x.k === k);
  return w ? (short ? w.name.split(' · ')[0] : w.name) : k;
};
export const vFind = (s: Pick<AppState, 'versions'>, k: string | null): VersionItem | undefined =>
  k && k !== 'cur' ? s.versions.find((v) => vKey(v) === k) : undefined;
/** Nhãn bản: "Tuần 02/11 · Bản 2" hoặc bảng đang làm. */
export const vLabel = (s: Pick<AppState, 'versions'>, k: string | null): string => {
  const v = vFind(s, k);
  return v ? wkName(v.wk, true) + ' · Bản ' + v.v : 'Bảng đang làm (tuần 3/11)';
};

/* bản do người dùng chốt được lưu lại trên "hệ thống" (localStorage pmo-proto-store-v1) */
function saveVersions(s: AppState): void {
  const o = lsJson<Record<string, unknown>>(LS.store);
  lsSet(LS.store, JSON.stringify({ ...o, versions: s.versions.filter((v) => v.snap && v.mine), fileName: s.fileName, savedAt: nowStr() }));
}

/* ---------- chốt bản (bước 3 · modal Chốt & xuất) ---------- */
/** Chốt bảng thành một bản: tuần này, hoặc tuần cũ đang "sửa tiếp". Không có lỗi chặn (bản gọn). */
export function doLock(by: string, note: string): void {
  const who = by.trim(), nt = note.trim();
  mutate((d) => {
    if (!who) { d.lockMsg = 'Gõ tên người chốt trước.'; return; }
    const rows = rowsOf(d), wk: WeekKey = d.editWk && d.editWk !== 'w3' ? d.editWk : 'w3', edit = wk !== 'w3';
    const nv = Math.max(0, ...d.versions.filter((x) => x.wk === wk).map((x) => x.v)) + 1;
    let hand = 0, aiOk = 0;
    rows.forEach((r) => { hand += Object.keys(r.ovr).length; AI_IDS.forEach((k) => { if (r.ai[k]?.ok) aiOk++; }); });
    const v: VersionItem = {
      wk, v: nv, by: who, at: nowStr(), note: nt || (edit ? 'Sửa tiếp từ ' + vLabel(d, d.openedVer) : ''), exported: null,
      snap: snapshot(rows, d), stats: { rows: rows.length, hand, ai: aiOk }, changes: [], mine: true, fileName: d.fileName
    };
    d.versions.unshift(v);
    sortVersions(d.versions);
    d.lockBy = who; d.lockMsg = null; d.verSel = wk + '|' + nv;
    if (edit) {
      d.openedVer = wk + '|' + nv;
      log(d, 'Chốt bản', wkName(wk, true) + ' · v' + nv, who + ' · sửa tiếp từ bản cũ');
      toast(d, 'Đã chốt Bản ' + nv + ' của ' + wkName(wk, true) + ' — giờ có thể xuất file');
    } else {
      log(d, 'Chốt bản', 'Tuần 3/11 · v' + nv, who + (nt ? ' · ' + nt : '') + ' · ' + rows.length + ' dự án');
      toast(d, 'Đã chốt Bản ' + nv + ' — giờ có thể xuất file');
    }
    /* mốc chỉnh sửa của bản: các lần sửa kể từ lần chốt trước */
    const added = d.versions.find((x) => x.wk === wk && x.v === nv)!;
    added.edits = verEditsNow(d.log, d.lockSeq);
    d.lockSeq = d.logSeq;
  });
  saveVersions(getState());
}

/* ---------- xuất Excel 49 cột ---------- */
function download(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
/** Xuất file .xlsx từ bảng (bản chốt mới nhất của tuần này ghi tên file đã xuất). Trên trình duyệt thì tải về. */
export function doExport(fname: string): Blob {
  const s = getState(), rows = rowsOf(s), cols = exFields(s.exCols, s.hidden), name = xlsxName(fname);
  const blob = exXlsx(rows, cols, s);
  mutate((d) => {
    const last = d.versions.find((v) => v.wk === 'w3'), nf = Object.keys(d.fmt).length;
    d.exported = fname;
    if (last) last.exported = fname;
    log(d, 'Xuất báo cáo', fname, 'Từ bản v' + (last ? last.v : '?') + ' · ' + rows.length + ' dòng · ' + cols.length + ' cột'
      + (nf ? ' · giữ định dạng ' + nf + ' ô' : '') + (d.exCols === 'all' ? ' · gồm cả cột đang ẩn' : ' · chỉ cột đang hiển thị'));
    if (inBrowser()) toast(d, 'Đã tải ' + name);
  });
  saveVersions(getState());
  if (inBrowser()) download(name, blob);
  return blob;
}
export function setExCols(v: AppState['exCols']): void { mutate((d) => { d.exCols = v; }); }

/* ---------- mở bản cũ lên bảng ---------- */
/* đưa giá trị của ảnh chụp vào bảng: nháp AI = đã duyệt, cột nhập tay ghi thẳng, cột nguồn thành sửa tay khi khác nguồn */
function applySnap(d: Draft<AppState>, snap: Snap): void {
  rowsOf(d).forEach((r0) => {
    const r = d.allRows[r0.i];
    FIELDS.forEach((f) => {
      const k = r.ma + '|' + f.id;
      if (!(k in snap)) return;
      const v = snap[k];
      if (f.kind === 'ai') { const a = f.id as 'rui'; if (v) r.ai[a] = { text: v, ok: true, why: 'bản đã chốt', src: '' }; else delete r.ai[a]; return; }
      if (f.kind === 'manual') { (r as unknown as Record<string, string>)[f.id] = v || ''; return; }
      if (locked(f)) return;
      const src = sourceValue(r, f, d);
      if ((v || '') !== (src || '') && v) r.ovr[f.id] = v; else delete r.ovr[f.id];
    });
  });
}
function openVersion(d: Draft<AppState>, v: VersionItem, snap: Snap): void {
  applySnap(d, snap);
  d.view = 'grid'; d.modal = null; d.panel = null; d.touched = {};
  d.openedVer = vKey(v);
  log(d, 'Mở lại bản đã chốt', 'v' + v.v + ' · ' + v.at, 'Không cần nhập lại file');
}

/** "Mở trên bảng tính →": nạp bản cũ (bản chưa lưu ảnh dùng ảnh minh hoạ) và bật banner "Đang sửa tiếp". Không đổi danh sách bản. */
export function vlEdit(k: string): void {
  let s = getState(), v = vFind(s, k);
  if (!v) return;
  if (!s.loaded) { loadFileNow(v.fileName || s.fileName || GOLD_FILE); s = getState(); v = vFind(s, k)!; }
  const snap = vSnap(v, rowsOf(s), s), ver = v;
  mutate((d) => {
    if (!snap) return toast(d, 'Bản này không có dữ liệu để mở lại');
    openVersion(d, ver, snap);
    d.editWk = ver.wk; d.vlView = 'lib'; d.vlOpen = null;
    const next = Math.max(...d.versions.filter((x) => x.wk === ver.wk).map((x) => x.v)) + 1;
    toast(d, 'Đang sửa tiếp Bản ' + ver.v + ' · ' + wkName(ver.wk, true) + ' — chốt lại sẽ thành Bản ' + next + ' của tuần này');
  });
}
/** "Mở →" ở "Bản đã lưu trên hệ thống" (bước 1): mở lại bản đã chốt trên bảng, không cần nhập file. */
export function verOpen(k: string): void {
  let s = getState(), v = vFind(s, k);
  if (!v || !v.snap) return mutate((d) => toast(d, 'Bản này không có dữ liệu để mở lại'));
  if (!s.loaded) { loadFileNow(v.fileName || s.fileName || GOLD_FILE); s = getState(); v = vFind(s, k)!; }
  const ver = v, snap = v.snap!;
  mutate((d) => { openVersion(d, ver, snap); toast(d, 'Đã mở bản v' + ver.v + ' (' + ver.at + ') — sửa tiếp rồi chốt thành bản mới'); });
}
/** "Về tuần này". */
export function vlExitEdit(): void { mutate((d) => { d.editWk = null; d.openedVer = null; toast(d, 'Đã về tuần 3/11'); }); }

/* ---------- màn Phiên bản ---------- */
/** Bấm một dòng bản đã chốt: xổ / thu bảng 5 chỉ số. */
export function vlTogExpand(k: string): void { mutate((d) => { d.vlOpen = d.vlOpen === k ? null : k; }); }
/** "Bản này" (B) và "so với" (A) của khối so sánh; đổi B thì A về bản ngay trước. */
export function vbSetA(k: string): void { mutate((d) => { d.vbA = k; d.vbMore = false; }); }
export function vbSetB(k: string): void { mutate((d) => { d.vbB = k; d.vbA = null; d.vbMore = false; }); }
export function vbToggleMore(): void { mutate((d) => { d.vbMore = !d.vbMore; }); }
/** Bản "tải lại file đã xuất" (bản thử chỉ ghi nhật ký). */
export function reExport(k: string): void {
  mutate((d) => { log(d, 'Tải lại file đã xuất', k.replace('|', ' · v'), 'Lấy đúng file của bản đã chốt'); toast(d, 'Bản thử: file đã xuất được tải lại từ bản đã chốt'); });
}

/* ---------- chọn tuần trên thanh trên ---------- */
/** Bấm một tuần: tuần đã chốt mở ở màn Phiên bản (chỉ xem); tuần này chỉ đóng menu. */
export function wkOpen(k: WeekKey): void {
  mutate((d) => {
    d.menu = null;
    if (k === 'w3') return;
    const vv = d.versions.find((v) => v.wk === k);
    d.view = 'ver'; d.verSel = vv ? vKey(vv) : null;
    toast(d, 'Tuần đã chốt chỉ xem, không sửa — đang mở bản v' + (vv ? vv.v : 1));
  });
}
/** "Lịch sử phiên bản" trong menu tuần. */
export function wkHist(): void { mutate((d) => { d.menu = null; d.view = 'ver'; }); }

/* Chốt bản, xuất Excel 49 cột, mở bản cũ sửa tiếp, danh sách & so sánh phiên bản.
   Port từ prototype v4 (doLock L5973/L10611, doExport + exXlsx, stSaveVersions, applySnap/openVersion, vlEdit L10572, vlTable3, vbPair). */
import { castDraft, type Draft } from 'immer';
import { AI_IDS, FIELDS, WEEKS } from '@/data/constants';
import { activeWkOf, locked, sourceValue, type WeeksCtx } from '@/lib/cell';
import { snapshot, verEditsNow, vKey, vSnap, type Snap } from '@/lib/versions';
import { api, ApiError } from '@/services/api';
import type { AppState, CellFormat, VersionItem, WeekKey } from '@/types';
import { flushPendingDraftSave, getState, inBrowser, log, mutate, rowsOf, sortVersions, toast, withSuppressedDraftSync } from '@/store';
import { applyIngest } from './flow';

const errMsg = (e: unknown): string => (e instanceof ApiError ? e.message : 'Có lỗi không mong đợi, thử lại sau.');

export const wkName = (k: WeekKey, short = false): string => {
  const w = WEEKS.find((x) => x.k === k);
  return w ? (short ? w.name.split(' · ')[0] : w.name) : k;
};
export const vFind = (s: Pick<AppState, 'versions'>, k: string | null): VersionItem | undefined =>
  k && k !== 'cur' ? s.versions.find((v) => vKey(v) === k) : undefined;
/** Nhãn bản: "Tuần 02/11 · Bản 2" hoặc bảng đang làm. */
export const vLabel = (s: Pick<AppState, 'versions'> & WeeksCtx, k: string | null): string => {
  const v = vFind(s, k);
  return v ? wkName(v.wk, true) + ' · Bản ' + v.v : 'Bảng đang làm (' + wkName(activeWkOf(s), true).toLowerCase() + ')';
};

/* Bản đã chốt nằm trên máy chủ; ô định dạng của bản lưu theo "mã|cột" (mã dự án), bảng dùng "chỉ số dòng|cột". */
const mapKeys = <T,>(src: Record<string, T>, conv: (id: string) => string | undefined): Record<string, T> => {
  const out: Record<string, T> = {};
  Object.entries(src).forEach(([k, v]) => { const [id, ...f] = k.split('|'), x = conv(id); if (x !== undefined) out[x + '|' + f.join('|')] = v; });
  return out;
};

/* ---------- chốt bản (bước 3 · modal Chốt & xuất) ---------- */
let busy = false;
/** Chốt bảng thành một bản trên máy chủ: tuần đang làm, hoặc tuần cũ đang "sửa tiếp". Không có lỗi chặn (bản gọn). */
export async function doLock(by: string, note: string): Promise<VersionItem | null> {
  const who = by.trim(), nt = note.trim(), s = getState();
  if (!who) { mutate((d) => { d.lockMsg = 'Gõ tên người chốt trước.'; }); return null; }
  if (!s.sessionId) { mutate((d) => { d.lockMsg = 'Nhập file Jira của tuần này trước, rồi chốt bản.'; }); return null; }
  if (busy) return null;
  const rows = rowsOf(s), cur = activeWkOf(s), wk: WeekKey = s.editWk && s.editWk !== cur ? s.editWk : cur, edit = wk !== cur;
  let hand = 0, aiOk = 0;
  rows.forEach((r) => { hand += Object.keys(r.ovr).length; AI_IDS.forEach((k) => { if (r.ai[k]?.ok) aiOk++; }); });
  const maOf = (i: string): string | undefined => s.allRows[+i]?.ma;
  busy = true;
  try {
    const item = await api.lockReport({
      session_id: s.sessionId, cycle_id: s.cycleId, wk, by: who, file_name: s.fileName,
      note: nt || (edit ? 'Sửa tiếp từ ' + vLabel(s, s.openedVer) : ''),
      snap: snapshot(rows, s), raw_notes: Object.fromEntries(rows.map((r) => [r.ma, r.note ?? ''])),
      fmt: mapKeys(s.fmt, maOf), wrap: mapKeys(s.wrap, maOf), hidden: s.hidden as Record<string, boolean>,
      stats: { rows: rows.length, hand, ai: aiOk }, edits: verEditsNow(s.log, s.lockSeq), log_seq: s.logSeq
    });
    mutate((d) => {
      d.versions.unshift(item);
      sortVersions(d.versions);
      d.lockBy = who; d.lockMsg = null; d.verSel = vKey(item);
      if (edit) {
        d.openedVer = vKey(item);
        log(d, 'Chốt bản', wkName(wk, true) + ' · v' + item.v, who + ' · sửa tiếp từ bản cũ');
        toast(d, 'Đã chốt Bản ' + item.v + ' của ' + wkName(wk, true) + ' — giờ có thể xuất file');
      } else {
        log(d, 'Chốt bản', wkName(wk, true) + ' · v' + item.v, who + (nt ? ' · ' + nt : '') + ' · ' + rows.length + ' dự án');
        toast(d, 'Đã chốt Bản ' + item.v + ' — giờ có thể xuất file');
      }
      d.lockSeq = d.logSeq;
    });
    return item;
  } catch (e) {
    mutate((d) => { d.lockMsg = errMsg(e); });
    return null;
  } finally { busy = false; }
}

/* ---------- xuất Excel 49 cột (máy chủ ghi vào file mẫu PMO) ---------- */
function download(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
/** Xuất file .xlsx từ ĐÚNG bản chốt mới nhất của tuần đang làm (hoặc tuần đang sửa tiếp). Trên trình duyệt thì tải về. */
export async function doExport(fname: string, opts: { onlyCurrentWeek?: boolean; appendOverrideNote?: boolean } = {}): Promise<Blob | null> {
  const s = getState(), cur = activeWkOf(s), wk = s.editWk && s.editWk !== cur ? s.editWk : cur, last = s.versions.find((v) => v.wk === wk);
  if (!last?.id) { mutate((d) => toast(d, 'Chốt bản trước, rồi mới xuất file')); return null; }
  try {
    const res = await api.exportExcel({
      version_id: last.id, file_name: fname, ex_cols: s.exCols, hidden: s.hidden as Record<string, boolean>,
      only_current_week: opts.onlyCurrentWeek ?? true, append_override_note: opts.appendOverrideNote ?? true
    });
    const rows = rowsOf(s), nf = Object.keys(s.fmt).length;
    mutate((d) => {
      d.exported = res.fileName;
      const v = d.versions.find((x) => x.id === last.id);
      if (v) v.exported = res.fileName;
      log(d, 'Xuất báo cáo', res.fileName, 'Từ bản v' + last.v + ' · ' + rows.length + ' dòng'
        + (nf ? ' · giữ định dạng ' + nf + ' ô' : '') + (d.exCols === 'all' ? ' · gồm cả cột đang ẩn' : ' · chỉ cột đang hiển thị'));
      if (inBrowser()) toast(d, 'Đã tải ' + res.fileName);
    });
    if (inBrowser()) download(res.fileName, res.blob);
    return res.blob;
  } catch (e) { mutate((d) => toast(d, errMsg(e))); return null; }
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
      if (locked(f, d)) return;
      const src = sourceValue(r, f, d);
      if ((v || '') !== (src || '') && v) r.ovr[f.id] = v; else delete r.ovr[f.id];
    });
  });
}
function openVersion(d: Draft<AppState>, v: VersionItem, snap: Snap): void {
  applySnap(d, snap);
  /* định dạng, ngắt dòng và cột ẩn lúc chốt: khoá "mã|cột" → "chỉ số dòng|cột" */
  const idx = new Map(d.allRows.map((r) => [r.ma, String(r.i)]));
  if (v.fmt) d.fmt = mapKeys<CellFormat>(v.fmt, (ma) => idx.get(ma));
  if (v.wrap) d.wrap = mapKeys(v.wrap, (ma) => idx.get(ma));
  if (v.hidden) d.hidden = { ...v.hidden } as AppState['hidden'];
  d.view = 'grid'; d.modal = null; d.panel = null; d.touched = {};
  d.openedVer = vKey(v);
  log(d, 'Mở lại bản đã chốt', 'v' + v.v + ' · ' + v.at, 'Không cần nhập lại file');
}

/* bảng tuần hiện tại, giữ trong RAM khi mở bản cũ để "Về tuần này" khôi phục (chỉ dùng khi cùng sessionId) */
let workingBackup: (Pick<AppState, 'allRows' | 'fmt' | 'wrap' | 'hidden' | 'pinViec' | 'exCols' | 'touched' | 'log' | 'logSeq' | 'lockSeq'> & { sessionId: string | null }) | null = null;

/** "Mở trên bảng tính →": nạp bản cũ (bản chưa lưu ảnh dùng ảnh minh hoạ) và bật banner "Đang sửa tiếp". Không đổi danh sách bản. */
export function vlEdit(k: string): void {
  const s = getState(), v = vFind(s, k);
  if (!v) return;
  if (!s.loaded) return mutate((d) => toast(d, 'Nhập file Jira của tuần này trước, rồi mở lại bản'));
  const snap = vSnap(v, rowsOf(s), s), ver = v;
  if (!snap) return mutate((d) => toast(d, 'Bản này không có dữ liệu để mở lại'));
  flushPendingDraftSave();
  if (!s.editWk) workingBackup = {
    sessionId: s.sessionId, allRows: s.allRows, fmt: s.fmt, wrap: s.wrap, hidden: s.hidden, pinViec: s.pinViec,
    exCols: s.exCols, touched: s.touched, log: s.log, logSeq: s.logSeq, lockSeq: s.lockSeq
  };
  withSuppressedDraftSync(() => mutate((d) => {
    openVersion(d, ver, snap);
    d.editWk = ver.wk; d.vlView = 'lib'; d.vlOpen = null;
    const next = Math.max(...d.versions.filter((x) => x.wk === ver.wk).map((x) => x.v)) + 1;
    toast(d, 'Đang sửa tiếp Bản ' + ver.v + ' · ' + wkName(ver.wk, true) + ' — chốt lại sẽ thành Bản ' + next + ' của ' + (ver.wk !== activeWkOf(d) ? 'tuần đó' : 'tuần này'));
  }, { resetUndo: true }));
}
/** "Mở →" ở "Bản đã lưu trên hệ thống" (bước 1): mở lại bản đã chốt trên bảng, không cần nhập file. */
export async function verOpen(k: string): Promise<void> {
  const v = vFind(getState(), k);
  if (!v || !v.snap) return mutate((d) => toast(d, 'Bản này không có dữ liệu để mở lại'));
  if (!getState().loaded) {
    if (!v.session_id) return mutate((d) => toast(d, 'Nhập file Jira của tuần này trước, rồi mở lại bản'));
    try { applyIngest(await api.getSession(v.session_id)); } catch (e) { return mutate((d) => toast(d, errMsg(e))); }
  }
  const ver = v, snap = v.snap;
  withSuppressedDraftSync(() => mutate((d) => {
    openVersion(d, ver, snap);
    if (ver.wk !== activeWkOf(d)) d.editWk = ver.wk;
    toast(d, 'Đã mở bản v' + ver.v + ' (' + ver.at + ') — sửa tiếp rồi chốt thành bản mới');
  }));
}
/** "Về tuần này". */
export function vlExitEdit(): void {
  const b = workingBackup;
  workingBackup = null;
  withSuppressedDraftSync(() => mutate((d) => {
    d.editWk = null; d.openedVer = null;
    if (b && b.sessionId === d.sessionId) {
      d.allRows = castDraft(b.allRows); d.fmt = castDraft(b.fmt); d.wrap = b.wrap; d.hidden = b.hidden; d.pinViec = b.pinViec;
      d.exCols = b.exCols; d.touched = b.touched; d.log = castDraft(b.log); d.logSeq = b.logSeq; d.lockSeq = b.lockSeq;
    }
    toast(d, 'Đã về ' + wkName(activeWkOf(d), true).toLowerCase());
  }, { resetUndo: true }));
}

/* ---------- màn Phiên bản ---------- */
/** Bấm một dòng bản đã chốt: xổ / thu bảng 5 chỉ số. */
export function vlTogExpand(k: string): void { mutate((d) => { d.vlOpen = d.vlOpen === k ? null : k; }); }
/** "Bản này" (B) và "so với" (A) của khối so sánh; đổi B thì A về bản ngay trước. */
export function vbSetA(k: string): void { mutate((d) => { d.vbA = k; d.vbMore = false; }); }
export function vbSetB(k: string): void { mutate((d) => { d.vbB = k; d.vbA = null; d.vbMore = false; }); }
export function vbToggleMore(): void { mutate((d) => { d.vbMore = !d.vbMore; }); }
/** "Tải lại file đã xuất": lấy đúng file .xlsx của bản đã chốt từ máy chủ. */
export async function reExport(k: string): Promise<void> {
  const v = vFind(getState(), k);
  if (!v?.id) return mutate((d) => toast(d, 'Bản này chưa có trên máy chủ để tải lại'));
  try {
    const res = await api.downloadVersionExcel(v.id);
    mutate((d) => { log(d, 'Tải lại file đã xuất', k.replace('|', ' · v'), 'Lấy đúng file của bản đã chốt'); toast(d, 'Đã tải ' + res.fileName); });
    if (inBrowser()) download(res.fileName, res.blob);
  } catch (e) { mutate((d) => toast(d, errMsg(e))); }
}

/* ---------- chọn tuần trên thanh trên ---------- */
/** Bấm một tuần: tuần đã chốt mở ở màn Phiên bản (chỉ xem, xổ bản mới nhất); tuần chưa chốt chỉ báo; tuần này chỉ đóng menu. */
export function wkOpen(k: WeekKey): void {
  mutate((d) => {
    d.menu = null;
    if (k === activeWkOf(d)) return;
    const vv = d.versions.find((v) => v.wk === k);
    if (!vv) return toast(d, wkName(k, true) + ' chưa có bản chốt nào');
    d.view = 'ver'; d.verSel = vKey(vv); d.vlOpen = vKey(vv);
    toast(d, 'Tuần đã chốt chỉ xem, không sửa — đang mở bản v' + vv.v);
  });
}
/** "Lịch sử phiên bản" trong menu tuần. */
export function wkHist(): void { mutate((d) => { d.menu = null; d.view = 'ver'; }); }

import { createStore, useStore as useZustand } from 'zustand';
import { FIELDS } from '@/data/constants';
import { nowStr } from '@/lib/text';
import { fieldOf } from '@/lib/cell';
import { mutate, getState, readJson, writeJson } from './index';
import { pushLog, setToast } from './helpers';
import type { GroupId } from '@/types';

/** Phiên bản cấu hình mẫu: tập cột đang ẩn (ngoài cột khoá). Số tuần suy ra từ cột ẩn. */
export interface TplVer { id: string; n: number; name: string; by: string; at: string; note: string; hidden: string[] }
interface TvState { base: string; list: TplVer[]; grp: GroupId }

const KEY = 'pmo-proto-tplver-v1';
const GROUP_IDS = (g: GroupId) => FIELDS.filter((f) => f.grp === g).map((f) => f.id);
const SEED: TplVer[] = [
  { id: 'v1', n: 1, name: 'Mặc định', by: 'Hệ thống', at: '11/11 09:00', note: 'Đủ cột của mẫu, 4 khối tuần', hidden: ['x', 'workstream'] },
  { id: 'v2', n: 2, name: 'Họp giao ban · 1 tuần', by: 'Hệ thống', at: '11/11 09:00', note: 'Ví dụ có sẵn: chỉ tuần hiện tại, bỏ cột nhân sự kỹ thuật',
    hidden: ['x', 'workstream', ...GROUP_IDS('w1'), ...GROUP_IDS('w2'), ...GROUP_IDS('w4'), 'aiEngineer', 'aiResearcher', 'mlopsEngineer', 'softwareEngineer'] },
];
const saved = readJson<{ base: string; list: TplVer[] }>(KEY);
export const tvStore = createStore<TvState>(() => ({ base: saved?.list?.length ? saved.base : 'v1', list: saved?.list?.length ? saved.list : SEED, grp: 'info' }));
export const useTv = <T,>(sel: (s: TvState) => T) => useZustand(tvStore, sel);
tvStore.subscribe((s) => writeJson(KEY, { base: s.base, list: s.list }));

export const tvNorm = (ids: string[]) => ids.filter((i) => FIELDS.some((f) => f.id === i && !f.key)).sort();
export const tvHiddenNow = (hidden: Record<string, boolean>) => FIELDS.filter((f) => !f.key && hidden[f.id]).map((f) => f.id).sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
/** Phiên bản khớp đúng tập cột đang hiện (ưu tiên bản đang dùng), hoặc null nếu đã chỉnh. */
export function tvMatch(hidden: Record<string, boolean>): TplVer | null {
  const { base, list } = tvStore.getState(); const now = tvHiddenNow(hidden);
  const b = list.find((v) => v.id === base);
  if (b && same(tvNorm(b.hidden), now)) return b;
  return list.find((v) => same(tvNorm(v.hidden), now)) || null;
}
export const tvWeeksOf = (hid: string[]) => (FIELDS.some((f) => f.grp === 'w1' && !hid.includes(f.id)) ? 3 : FIELDS.some((f) => f.grp === 'w2' && !hid.includes(f.id)) ? 2 : 1);
export const tvCount = (hid: string[]) => FIELDS.length - hid.length;
export const tvName = (v: TplVer) => `v${v.n} · ${v.name}`;
export const tvGrpIds = GROUP_IDS;

export function tvSetHidden(ids: string[], on: boolean) {
  mutate((d) => {
    ids.forEach((id) => { if (fieldOf(d, id).key) return; if (on) d.hidden[id] = true; else delete d.hidden[id]; });
    if (d.sel && d.hidden[d.sel.f]) { d.sel = null; d.range = null; }
  });
}
export function tvSetWeeks(n: number) {
  tvSetHidden(GROUP_IDS('w1'), n < 3); tvSetHidden(GROUP_IDS('w2'), n < 2); tvSetHidden(GROUP_IDS('w3'), false);
}
export const tvSetGrp = (g: GroupId) => tvStore.setState({ grp: g });
export function tvApply(id: string) {
  const v = tvStore.getState().list.find((x) => x.id === id); if (!v) return;
  mutate((d) => { d.hidden = {}; });
  tvSetHidden(tvNorm(v.hidden), true);
  tvStore.setState({ base: v.id });
  mutate((d) => { const h = tvNorm(v.hidden); pushLog(d, 'Dùng phiên bản mẫu', tvName(v), `${tvWeeksOf(h)} tuần · ${tvCount(h)}/${FIELDS.length} cột`); setToast(d, `Đang dùng ${tvName(v)}. Bảng dữ liệu và file xuất đã đổi theo`); });
}
export function tvReset() {
  const { list, base } = tvStore.getState(); const b = list.find((v) => v.id === base) || list[0];
  mutate((d) => { d.hidden = {}; });
  tvSetHidden(tvNorm(b.hidden), true);
  mutate((d) => setToast(d, 'Đã quay về ' + tvName(b)));
}
/** Trả về lỗi (chuỗi) nếu không lưu được. */
export function tvSave(name: string, note: string): string | null {
  const nm = name.trim();
  if (!nm) return 'Đặt tên cho phiên bản trước khi lưu.';
  const { list } = tvStore.getState();
  if (list.some((x) => x.name.toLowerCase() === nm.toLowerCase())) return 'Đã có phiên bản tên này, đặt tên khác để dễ phân biệt.';
  const s = getState(); const hid = tvHiddenNow(s.hidden); const n = Math.max(...list.map((x) => x.n)) + 1;
  const nv: TplVer = { id: 'v' + n, n, name: nm, by: s.lockBy || 'Khuê', at: nowStr(), note: note.trim(), hidden: hid };
  tvStore.setState({ list: [...list, nv], base: nv.id });
  mutate((d) => { pushLog(d, 'Lưu phiên bản mẫu', tvName(nv), `${tvWeeksOf(hid)} tuần · ${tvCount(hid)}/${FIELDS.length} cột`); setToast(d, 'Đã lưu ' + tvName(nv)); });
  return null;
}
export function tvDelete(id: string) {
  if (id === 'v1') return;
  const { list, base } = tvStore.getState(); const v = list.find((x) => x.id === id); if (!v) return;
  tvStore.setState({ list: list.filter((x) => x.id !== id), base: base === id ? 'v1' : base });
  mutate((d) => setToast(d, 'Đã xoá ' + tvName(v)));
}
export function tvExportNote(hidden: Record<string, boolean>) {
  const h = tvHiddenNow(hidden); const m = tvMatch(hidden);
  return `${m ? tvName(m) : 'Cấu hình đã chỉnh'} · ${tvWeeksOf(h)} tuần, ${tvCount(h)}/${FIELDS.length} cột`;
}

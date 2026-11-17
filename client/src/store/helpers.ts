import type { Row } from '@/types';
import { cellValue, fieldOf, locked, optsFor } from '@/lib/cell';
import { refOf } from '@/lib/grid';
import { clockStr } from '@/lib/text';
import type { AppState } from './types';

/** Các recipe nhỏ dùng chung bên trong `mutate(d => ...)`. `d` là draft immer. */

export function pushLog(d: AppState, a: string, o: string, dd: string, r = 'Thành công') {
  d.log.unshift({ t: clockStr(), a, o, d: dd, r });
}

export const setToast = (d: AppState, m: string) => { d.toast = m; };

/** giá trị theo nguồn (bỏ giá trị sửa tay) */
export const sourceValue = (d: AppState, r: Row, fid: string) => cellValue(d, r, fieldOf(d, fid), true);

/**
 * Áp dụng chỉnh sửa vào ô. Trả `true` nếu có đổi.
 * Ô AI: lưu & duyệt; ô nhập tay: ghi thẳng; ô lấy từ nguồn: ghi đè (ovr) hoặc khôi phục.
 */
export function applyEdit(d: AppState, i: number, fid: string, raw: unknown): boolean {
  const r = d.allRows[i];
  const f = fieldOf(d, fid);
  if (!r || !f || locked(f)) return false;
  const v = String(raw === null || raw === undefined ? '' : raw).trim();
  const where = `${r.code} · ${f.col} ${f.name}`;
  if (f.kind === 'ai') {
    const cur = r.ai[fid];
    if (cur && cur.text === v && cur.ok) return false;
    if (!cur && !v) return false;
    if (v) r.ai[fid] = { text: v, ok: true, why: cur ? cur.why : 'người dùng nhập' }; else delete r.ai[fid];
    pushLog(d, cur ? 'Sửa nội dung AI' : 'Nhập tay ô AI', where, v ? 'Lưu và duyệt' : 'Xoá nội dung');
    return true;
  }
  if (f.kind === 'manual') {
    if (v && f.opts && !f.opts.includes(v)) { setToast(d, `Cột ${f.col} chỉ nhận giá trị trong danh sách: ${f.opts.join(', ')}`); return false; }
    if (((r[fid] as string) || '') === v) return false;
    (r as Record<string, unknown>)[fid] = v;
    pushLog(d, 'Sửa ô', where, v ? 'Đặt giá trị ' + v : 'Xoá giá trị');
    return true;
  }
  const src = sourceValue(d, r, fid);
  const cur = cellValue(d, r, f) || '';
  if (v === cur) return false;
  if (!v || v === src) { delete r.ovr[fid]; pushLog(d, 'Khôi phục theo nguồn', where, 'Bỏ giá trị sửa tay'); }
  else { r.ovr[fid] = v; pushLog(d, 'Sửa tay ô lấy từ nguồn', where, `${src ? 'Nguồn ghi “' + src + '”' : 'Nguồn trống'} → “${v}” · ghi vào Note`); }
  return true;
}

export { cellValue, fieldOf, locked, optsFor, refOf };

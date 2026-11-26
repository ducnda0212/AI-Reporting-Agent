/* Cửa sổ nổi chi tiết dự án: tìm trong thẻ, thứ tự tuần, timeline Milestone. Port từ prototype v4. */
import { FIELDS } from '@/data/constants';
import type { FieldId, PopoutHit, Row, ActiveWeek } from '@/types';
import { displayText, type CellCtx } from './cell';

export const PO_SECS: readonly (readonly [id: string, label: string])[] = [
  ['info', 'Thông tin dự án'], ['prog', 'Tiến độ & trạng thái'], ['org', 'Đơn vị & nhân sự'], ['eval', 'Phân loại & đánh giá']
];

export type PoWeek = readonly [k: string, name: string, range: string, cols: readonly [FieldId, FieldId, FieldId]];
export const PO_WKS: readonly PoWeek[] = [
  ['w1', 'Tuần 01/11', '31/10–06/11', ['w1ht', 'w1kh', 'w1vd']],
  ['w2', 'Tuần 02/11', '07–14/11', ['w2ht', 'w2kh', 'w2vd']],
  ['w3', 'Tuần 3/11', '15–22/11 · tuần này', ['ht', 'kh', 'vd']],
  ['w4', 'Tuần 4/11', '23–30/11 · chưa tới', ['w4ht', 'w4kh', 'w4vd']]
];

/** Bỏ dấu + chữ thường để tìm không phân biệt dấu (đ → d). */
export function poNm(s: unknown): string {
  const t = String(s ?? '');
  let o = '';
  for (const c of t) o += c === 'đ' || c === 'Đ' ? 'd' : c.normalize('NFD').charAt(0).toLowerCase();
  return o;
}

/** 4 tuần của kỳ đang mở (cột giữ theo PO_WKS); `weeks` rỗng thì dùng PO_WKS mặc định. */
export function poWeeks(wkDesc: boolean, weeks?: readonly (Pick<ActiveWeek, 'k' | 'name' | 'range'> & Partial<ActiveWeek>)[]): readonly PoWeek[] {
  const base: readonly PoWeek[] = weeks && weeks.length
    ? PO_WKS.map((p): PoWeek => {
        const w = weeks.find((x) => x.k === p[0]);
        return w ? [p[0], w.name.split(' · ')[0], w.range + (w.cur ? ' · tuần này' : w.future ? ' · chưa tới' : ''), p[3]] : p;
      })
    : PO_WKS;
  return wkDesc ? base.slice().reverse() : base;
}

/** Các ô của một dự án khớp từ khoá, theo thứ tự mục trái → báo cáo tuần. */
export function poHitsCompute(row: Row, q: string, wkDesc: boolean, ctx: CellCtx): PopoutHit[] {
  const n = poNm(q.trim());
  const hits: PopoutHit[] = [];
  if (!n) return hits;
  const push = (fid: FieldId, sec: string): void => {
    const f = FIELDS.find((x) => x.id === fid);
    if (f && poNm(displayText(row, f, ctx)).includes(n)) hits.push({ f: fid, sec });
  };
  PO_SECS.forEach(([sec]) => {
    const ids: FieldId[] = sec === 'info' ? ['viec'] : [];
    FIELDS.forEach((f) => { if (f.grp === sec && f.kind !== 'none') ids.push(f.id); });
    ids.forEach((fid) => push(fid, sec));
  });
  poWeeks(wkDesc).forEach((w) => w[3].forEach((fid) => push(fid, 'wk')));
  return hits;
}

export interface Milestone { date: string | null; text: string; status: 'done' | 'next' | '' }

/** Mỗi dòng "dd/mm: nội dung" hoặc "yyyy-mm-dd nội dung" (Jira); mốc đến hết ngày tham chiếu (activeToday, mặc định 2026-11-22) là done, sau đó là next; dòng không có ngày để status rỗng. */
export function parseMilestones(text: string, refTodayIso = '2026-11-22'): Milestone[] {
  const [ry, rm, rd] = refTodayIso.split('-').map(Number), today = new Date(ry, rm - 1, rd);
  return text.split('\n').map((s) => s.trim()).filter(Boolean).map((s): Milestone => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})[:\s-]*(.*)$/.exec(s);
    if (iso) return { date: iso[3] + '/' + iso[2], text: iso[4], status: new Date(+iso[1], +iso[2] - 1, +iso[3]) <= today ? 'done' : 'next' }; // năm đủ 4 chữ số: 15/01/2027 chưa tới khi đang tháng 12/2026
    const m = /^(\d{1,2})\/(\d{1,2})\s*:\s*(.*)$/.exec(s);
    if (!m) return { date: null, text: s, status: '' };
    const d = new Date(ry, +m[2] - 1, +m[1]);
    return { date: m[1] + '/' + m[2], text: m[3], status: d <= today ? 'done' : 'next' };
  });
}

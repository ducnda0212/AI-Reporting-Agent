/* Nối nút "Nhờ AI soạn các ô trống" với backend (/api/ai/draft). Hàm thuần, không ghi state.
   Backend soạn hai ô: Vấn đề, rủi ro và Đề xuất (AT) và Mức độ rủi ro (AC). Ô Kế hoạch tuần sau (AS) lấy thẳng từ Progress Report theo luật
   nên vẫn do `aiDrafts` làm tại chỗ. Mọi kết quả vào dạng nháp chờ duyệt (ok: false). */
import { TODAY } from '@/data/constants';
import type { AiDraftCell } from './ai';
import type { DraftOut, DraftRequestRow } from './api';
import type { Row } from '@/types';

/** Backend nhận tối đa 60 dòng mỗi lần. */
export const DRAFT_CHUNK = 60;
const LEVELS = ['Thấp', 'Trung bình', 'Cao'];

const iso = (d: Date): string => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** Tuần đang làm: 7 ngày tính đến ngày báo cáo (ví dụ 15–22/11), cùng tuần với `prw.w3`. */
export function reportWeek(today: Date = TODAY): { key: string; start: string; end: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  return { key: 'w3', start: iso(start), end: iso(today) };
}

/** Một dòng bảng gửi cho backend soạn nháp. `show` đọc giá trị đang hiển thị của một cột theo id. Tên người gửi riêng để backend che. */
export function draftRequestRow(r: Row, show: (id: string) => string, late: boolean, today: Date = TODAY): DraftRequestRow {
  const last = r.pr?.length ? r.pr[r.pr.length - 1] : null, cw = r.prw?.w3 ?? null;
  const people = [...new Set([r.pic, r.po, r.tl, ...(r.subtasks || []).map((x) => x.assignee)].map((x) => (x || '').trim()).filter(Boolean))];
  return {
    id: r.i, code: r.ma, task: r.viec, status: show('tt'), progress: show('td'), end: show('end'), late,
    week: reportWeek(today),
    weekReport: cw ? { date: cw.date, done: cw.done, plan: cw.plan } : null,
    lastReport: last ? { date: last.date, done: last.done, plan: last.plan } : null,
    comment: r.comment || '', commentRaw: r.comment || '', riskNotes: '', people,
  };
}

export interface RemoteDrafts { drafts: Record<string, DraftOut>; errors: Record<string, string>; model: string }
export interface Merged { cells: AiDraftCell[]; fromAi: number; byRule: number }

/** Thay nháp theo luật bằng nháp của backend cho ô AC và AT; ô AS và dòng backend lỗi giữ nguyên nháp theo luật. */
export function mergeRemote(local: AiDraftCell[], remote: RemoteDrafts): Merged {
  let fromAi = 0, byRule = 0;
  const cells = local.map((x) => {
    const dr = remote.drafts[String(x.i)];
    if (!dr || (x.f !== 'rui' && x.f !== 'vd')) { byRule++; return x; }
    if (x.f === 'rui') {
      const t = dr.riskLevel?.text;
      if (!LEVELS.includes(t)) { byRule++; return x; }
      fromAi++;
      return { ...x, d: { ...x.d, text: t, why: dr.riskLevel.why || x.d.why, ok: false } };
    }
    const sg = dr.issues?.suggestion, text = (sg ? sg.merged : dr.issues?.text || '').trim();
    if (!text) { byRule++; return x; }
    fromAi++;
    return { ...x, d: { ...x.d, text, why: (sg ? sg.why : dr.issues.why) || x.d.why, ok: false } };
  });
  return { cells, fromAi, byRule };
}

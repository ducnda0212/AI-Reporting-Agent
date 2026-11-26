/* Lệnh sửa bảng mà luật tại chỗ (lib/ai.ts) không hiểu: gửi cho backend để V-LLM đọc ý, trả về các thao tác sửa.
   V-LLM chỉ ĐỀ XUẤT: backend kiểm cột, giá trị, mã dự án, phạm vi; giao diện đổi kết quả thành bản xem trước, bảng chỉ đổi khi người dùng bấm Áp dụng.
   Hàm thuần, không ghi state. */
import { FIELDS } from '@/data/constants';
import type { AgStageItem, Field, Row } from '@/types';
import type { AgentEditAnswer, AgentEditField, AgentEditRow } from './api';
import { aiCanFill } from './ai';
import { displayText, optsFor, type CellCtx } from './cell';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Câu trả lời tại chỗ cho thấy luật không hiểu lệnh (hỏi lại hoặc xin ví dụ), nên nhờ V-LLM đọc ý. */
export const localDidNotUnderstand = (html: string): boolean => /Mình chưa (hiểu|trả lời được)|Bạn muốn (Agent sửa ô nào|đổi )/.test(html);

/** Câu sửa bảng viết tự nhiên, không bắt đầu bằng động từ: "mấy dự án trễ thì ghi note chờ họp", "I.A.3.1 mức rủi ro cao", "set note của I.A.3.1 là chờ họp".
 *  Chỉ quyết định "có phải lệnh sửa không"; hiểu cột, giá trị, phạm vi là việc của V-LLM (backend kiểm lại). Câu hỏi không tính. */
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
const EV = '(?:ghi(?!\\s*chú)|điền|đặt|đổi|chuyển|chỉnh|sửa|cập nhật|đánh dấu|gán|thêm|xóa|xoá|đưa(?!\\s*ra)|set|mark|update|change|note lại)';
const CODE_S = '[IVX]+\\.[A-Z0-9]+\\.\\d+\\.\\d+';
const COL = '(?:note|ghi chú|mức(?: độ)? rủi ro|rủi ro|tiến độ|trạng thái|giá trị|nhóm)';
const SCOPE = '(?:' + CODE_S + '|tất cả|mọi|các dự án|mấy dự án|những dự án|dự án)';
const ASK = /(?:\?|\bkhông|\bgì|\bnào|\bai\b|ra sao|thế nào|như thế nào|bao nhiêu|là gì|là ai)\s*$|^(?:dự án nào|có bao nhiêu|bao nhiêu|ai\b|vì sao|tại sao|liệt kê|thống kê|tóm tắt|tìm\b|cho biết|cho hỏi|hỏi)|\b(?:là gì|là ai|ra sao|thế nào|bao nhiêu)\b/i;
export function looksLikeEdit(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (new RegExp(B + '(?:thì|rồi)\\s+(?:là\\s+)?' + EV + E, 'iu').test(t)) return !/\?\s*$/.test(t);  // "…thì ghi X": điều kiện + hành động, kể cả khi mở đầu bằng "dự án nào"
  if (ASK.test(t)) return false;
  const verb = new RegExp(B + EV + E, 'iu').test(t), col = new RegExp(B + COL + E, 'iu').test(t), scope = new RegExp(SCOPE, 'iu').test(t);
  if (verb && (col || scope)) return true;
  if (col && scope && /(?:^|\s)(?:là|thành|sang|về|=|:)(?:\s|$)/.test(t)) return true;  // "cho các dự án Food ghi chú là đã họp", "dự án I.A.3.1 tiến độ phải là Chậm tiến độ"
  if (new RegExp(B + 'thì\\s+cho\\s+' + COL + E, 'iu').test(t)) return true;  // "dự án trễ thì cho rủi ro cao"
  if (new RegExp(B + 'thì\\s+' + COL + '\\s*(?:là|=|:|thành)', 'iu').test(t)) return true;  // "dự án rủi ro cao thì note là cần escalate"
  /* câu khai báo không có động từ: "I.A.3.1 mức rủi ro cao", "I.A.3.1 và I.A.4.1 rủi ro cao", "note I.A.3.1 = chờ họp", "cho I.A.3.1 mức rủi ro cao nhé" */
  return new RegExp('^(?:cho\\s+)?(?:' + CODE_S + '(?:\\s*(?:,|và|với)\\s*' + CODE_S + ')*)\\s+(?:và\\s+\\S+\\s+)?(?:chuyển\\s+)?(?:sang\\s+|thành\\s+)?' + COL + E, 'iu').test(t)
    || new RegExp('^' + COL + '\\s+' + CODE_S + '\\s*(?:=|:|là|thành)', 'iu').test(t)
    || new RegExp('^cho\\s+' + CODE_S + '[\\s\\S]*' + B + COL + E, 'iu').test(t);
}

/** Danh sách cột cho backend: id, tên, giá trị cho phép và cột có sửa tay được không. */
export function editFields(): AgentEditField[] {
  return FIELDS.map((f: Field) => ({ id: f.id, name: f.name, options: [...(optsFor(f) || [])], editable: aiCanFill(f), lockedWhy: aiCanFill(f) ? '' : 'không điền tay được (lấy từ nguồn khác)' }));
}

/** Giá trị đang hiển thị của mọi cột theo từng dòng, để backend biết "đang trống", "chậm tiến độ"... */
export function editRows(rows: Row[], ctx: CellCtx): AgentEditRow[] {
  return rows.map((r) => ({ code: r.ma, values: Object.fromEntries(FIELDS.map((f: Field) => [f.id, displayText(r, f, ctx) || ''])) }));
}

/** Đề xuất của backend → các dòng của bản xem trước. Bỏ đề xuất trỏ tới mã hoặc cột không có, ô không đổi và cột không sửa tay được. */
export function toStageItems(res: Pick<AgentEditAnswer, 'proposals'>, rows: Row[]): AgStageItem[] {
  const byCode = new Map(rows.map((r) => [r.ma.toUpperCase(), r]));
  const ok = new Map<string, Field>(FIELDS.filter(aiCanFill).map((f: Field) => [f.id as string, f]));
  const out: AgStageItem[] = [];
  for (const p of res.proposals || []) {
    const r = byCode.get(String(p.code).toUpperCase()), f = ok.get(p.field);
    if (!r || !f || p.from === p.to) continue;
    out.push({ i: r.i, f: f.id, from: p.from ?? '', to: p.to, kind: 'edit' });
  }
  return out;
}

/** Câu trả lời hiện trong khung chat: câu tóm tắt của backend và lý do các phần bị bỏ qua. */
export function editHtml(res: Pick<AgentEditAnswer, 'answer' | 'skipped'>, n: number): string {
  const skipped = (res.skipped || []).map((s) => s.reason).filter(Boolean);
  const head = n
    ? 'V-LLM đã đọc ý lệnh và soạn <b>' + n + ' thay đổi</b>. Xem lại bên dưới, bỏ tick dòng không muốn, rồi bấm <b>Áp dụng</b> — bảng chỉ đổi sau khi bạn duyệt.'
    : esc(res.answer || 'Agent chưa đề xuất thay đổi nào.');
  return head + (skipped.length ? '<ul>' + skipped.slice(0, 4).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
}

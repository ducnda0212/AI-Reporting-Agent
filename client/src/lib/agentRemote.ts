/* Nối Trợ lý AI với backend (/api/agent/ask). Hàm thuần, không ghi state.
   Quy tắc: câu HỎI đáp (số liệu, danh sách) đi qua backend; lệnh sửa bảng, ẩn/hiện cột, lọc và câu nói về "dự án đang chọn"
   vẫn do lib/ai.ts xử lý tại chỗ vì cần biết ô đang chọn và dựng bản xem trước. */
import type { AgentAnswer } from './api';
import type { Row } from '@/types';

/** Backend nhận tối đa 300 dòng và câu hỏi tối đa 500 ký tự. */
export const REMOTE_MAX_ROWS = 300;
export const REMOTE_MAX_QUESTION = 500;

const COMMAND = /^\s*(?:(?:hãy|nhờ|giúp|vui lòng|agent|bạn)\s+)*(?:đổi|điền|sửa|đặt|chuyển|ghi|cập nhật|duyệt|áp dụng|thêm|xoá|xóa|ẩn|hiện|bỏ|lọc|chốt|gán|đánh dấu)\b/i;
const SELECTION = /đang chọn|dự án này|dòng này|ô này/i;
const CODE = /\b([IVX]+\.[A-Z0-9]+\.\d+\.\d+)\b/g;

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** true = giữ ở giao diện (lệnh sửa bảng, hoặc câu cần biết ô đang chọn). */
export const keepLocal = (q: string): boolean => COMMAND.test(q) || SELECTION.test(q);

/** Đổi câu trả lời của Agent thành HTML: mã dự án thành nút bấm tới dòng đó, kèm dòng nguồn nói rõ ai viết câu trả lời. */
export function agentHtml(res: AgentAnswer, rows: Pick<Row, 'i' | 'ma'>[]): string {
  const byCode = new Map(rows.map((r) => [r.ma.toUpperCase(), r.i]));
  const body = esc(res.answer.trim()).replace(CODE, (m) => {
    const i = byCode.get(m.toUpperCase());
    return i === undefined ? m : '<button class="cd" data-act="exGo" data-i="' + i + '">' + m + '</button>';
  }).replace(/\n/g, '<br>');
  const ai = res.by && res.by !== 'rule' && res.by !== 'mock';
  const src = ai
    ? 'Số liệu tính từ bảng hiện tại · lời văn do ' + esc(res.by) + ', đã kiểm tra mã dự án và con số'
    : res.grounded
      ? 'Số liệu tính từ bảng hiện tại'
      : 'Số liệu tính từ bảng hiện tại · AI trả lời lệch số liệu nên dùng câu mẫu' + (res.warnings.length ? ' (' + esc(res.warnings.slice(0, 2).join('; ')) + ')' : '');
  return '<div>' + body + '</div><div class="src">' + src + '</div>';
}

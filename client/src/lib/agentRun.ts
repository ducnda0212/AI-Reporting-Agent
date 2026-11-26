/* Thẻ "Agent đang làm" trong khung chat: các bước của luồng xử lý hiện lần lượt trong lúc chờ câu trả lời.
   Hàm thuần. Các bước mô tả đúng luồng của backend (đọc yêu cầu, code tra số liệu, kiểm tra, viết câu); thời điểm chuyển bước chỉ ước lượng,
   bước cuối giữ trạng thái "đang làm" cho tới khi câu trả lời về. */
import { keepLocal } from './agentRemote';

export interface RunSteps { title: string; steps: string[]; command: boolean }

const COMMAND_STEPS = ['Đọc yêu cầu', 'Tìm dòng và cột cần sửa', 'Kiểm tra quy tắc của ô', 'Dựng bản xem trước'];
const QUESTION_STEPS = ['Đọc câu hỏi', 'Tra số liệu trong bảng', 'Kiểm tra mã dự án và con số', 'Viết câu trả lời'];

/** Mỗi bước hiện bao lâu trước khi sang bước kế. */
export const STEP_MS = 700;
/** Từ giây này trở đi hiện bộ đếm "N giây" để người dùng biết Agent vẫn đang chạy. */
export const ELAPSED_SHOW_MS = 3000;

export function runSteps(q: string): RunSteps {
  const command = keepLocal(q);
  return command ? { title: 'Agent đang soạn thay đổi', steps: COMMAND_STEPS, command } : { title: 'Agent đang trả lời', steps: QUESTION_STEPS, command };
}

/** Bước đang làm sau `ms` mili giây; bước cuối không bao giờ xong cho tới khi câu trả lời về. */
export const activeStep = (ms: number, n: number): number => Math.max(0, Math.min(n - 1, Math.floor(ms / STEP_MS)));
export type StepState = 'ok' | 'on' | 'wait';
export const stepState = (k: number, active: number): StepState => (k < active ? 'ok' : k === active ? 'on' : 'wait');

/** Chữ trên con trỏ Agent: giá trị sắp điền (xem trước) hoặc đã điền (áp dụng). Cắt gọn để không che bảng. */
export function cursorTag(tag: string, applied: boolean, max = 26): string {
  const t = (tag || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return (applied ? '✓ ' : '→ ') + (t.length > max ? t.slice(0, max - 1) + '…' : t);
}

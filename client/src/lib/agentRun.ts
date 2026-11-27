/* Thẻ "Agent đang làm" trong khung chat: các bước của luồng xử lý hiện lần lượt trong lúc chờ câu trả lời.
   Hàm thuần. Các bước mô tả đúng luồng của backend (đọc yêu cầu, code tra số liệu, kiểm tra, viết câu); thời điểm chuyển bước chỉ ước lượng,
   bước cuối giữ trạng thái "đang làm" cho tới khi câu trả lời về. */
export interface RunSteps { title: string; steps: string[]; command: boolean }

/* Chưa biết ý định cho tới khi V-LLM đọc xong, nên các bước chờ dùng nhãn chung (không đoán hỏi hay sửa bằng từ khoá). */
const STEPS = ['Đọc và hiểu yêu cầu', 'Tra số liệu hoặc tìm ô liên quan', 'Kiểm tra mã dự án và con số', 'Chuẩn bị câu trả lời'];

/** Mỗi bước hiện bao lâu trước khi sang bước kế. */
export const STEP_MS = 700;
/** Từ giây này trở đi hiện bộ đếm "N giây" để người dùng biết Agent vẫn đang chạy. */
export const ELAPSED_SHOW_MS = 3000;

export function runSteps(_q: string): RunSteps {
  return { title: 'Agent đang xử lý', steps: STEPS, command: false };
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

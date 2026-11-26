/* File test cũ của tính năng "gợi ý AI cho ô Vấn đề/rủi ro" (draftAi, applyDraft, draftPayload, reviewApprove...).
   Các hàm đó đã bị bỏ khi dọn frontend nên cả 5 test đều fail và làm `npm run typecheck` / `npm run build` lỗi.
   Giữ lại chỗ này dạng bỏ qua để build chạy được. Xoá file này đi; khi làm lại tính năng gợi ý thì viết test mới.
   Phần nối Trợ lý AI với backend có test ở agent-remote.test.ts. */
import { describe, it } from 'vitest';

describe.skip('AI gợi ý ô Vấn đề, rủi ro và Đề xuất (test cũ, đã thay bằng agent-remote.test.ts)', () => {
  it.skip('không còn áp dụng', () => undefined);
});

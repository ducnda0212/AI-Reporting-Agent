import { describe, it, expect } from 'vitest';
import { aiCanFill } from '@/lib/ai';
import { editFields, toStageItems } from '@/lib/agentEdit';
import { fieldById } from '@/lib/cell';
import type { Row } from '@/types';

/* Cột Trạng thái (I) lấy từ Jira: Agent không được đề xuất đổi. */
describe('Agent không sửa cột Trạng thái Jira', () => {
  it('Trạng thái bị khoá với Agent, Tiến độ và Ghi chú vẫn sửa được', () => {
    expect(aiCanFill(fieldById('tt')!)).toBe(false);
    expect(aiCanFill(fieldById('td')!)).toBe(true);
    expect(aiCanFill(fieldById('note')!)).toBe(true);
    const tt = editFields().find((f) => f.id === 'tt')!;
    expect(tt.editable).toBe(false);
  });

  it('đề xuất đổi Trạng thái từ backend bị bỏ khỏi bản xem trước', () => {
    const rows = [{ i: 0, ma: 'I.A.1.1', viec: 'Demo', ovr: {}, ai: {}, reasons: {}, stages: [] } as never as Row];
    const items = toStageItems({ proposals: [{ code: 'I.A.1.1', field: 'tt', from: 'Đang thực hiện', to: 'Đã hoàn thành' }, { code: 'I.A.1.1', field: 'note', from: '', to: 'Chờ họp' }] } as never, rows);
    expect(items.map((x) => x.f)).toEqual(['note']);
  });
});
